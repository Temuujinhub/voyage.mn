import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { q } from '../db/pool.js';
import { getSetting } from './settings.js';
import { importManifest } from './manifestImport.js';

// Polls the designated manifest mailbox (configured in Settings → IMAP) and
// imports every .xlsx attachment through the same validation pipeline as
// manual uploads. Every message is recorded in email_ingest_log.

let timer = null;
let running = false;

async function alreadyProcessed(mailbox, uid) {
  const { rows } = await q(
    'SELECT 1 FROM email_ingest_log WHERE mailbox = $1 AND message_uid = $2',
    [mailbox, String(uid)]
  );
  return rows.length > 0;
}

async function logIngest({ uid, mailbox, from, subject, receivedAt, status, detail, manifestId }) {
  await q(
    `INSERT INTO email_ingest_log (message_uid, mailbox, from_addr, subject, received_at, status, detail, manifest_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (mailbox, message_uid) DO NOTHING`,
    [String(uid), mailbox, from, subject, receivedAt, status, detail, manifestId || null]
  );
}

export async function pollOnce() {
  const imap = await getSetting('imap');
  if (!imap?.enabled || !imap.host || !imap.user) return { skipped: true };
  if (running) return { busy: true };
  running = true;

  const client = new ImapFlow({
    host: imap.host,
    port: imap.port || 993,
    secure: imap.secure !== false,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
  });

  const stats = { processed: 0, skipped: 0, errors: 0 };
  try {
    await client.connect();
    const lock = await client.getMailboxLock(imap.folder || 'INBOX');
    try {
      const uids = await client.search({ seen: false });
      for (const uid of uids || []) {
        if (await alreadyProcessed(imap.host + '/' + imap.user, uid)) continue;
        const msg = await client.fetchOne(uid, { source: true, envelope: true });
        if (!msg?.source) continue;
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.value?.[0]?.address || '';
        const subject = parsed.subject || '';
        const mailboxKey = imap.host + '/' + imap.user;

        const allowed = imap.allowed_senders || [];
        if (allowed.length && !allowed.some((a) => from.toLowerCase().includes(a.toLowerCase()))) {
          await logIngest({ uid, mailbox: mailboxKey, from, subject, receivedAt: parsed.date, status: 'SKIPPED', detail: 'Sender not in allowed list' });
          await client.messageFlagsAdd(uid, ['\\Seen']);
          stats.skipped++;
          continue;
        }

        const xlsx = (parsed.attachments || []).filter((a) => /\.xlsx?$/i.test(a.filename || ''));
        if (xlsx.length === 0) {
          await logIngest({ uid, mailbox: mailboxKey, from, subject, receivedAt: parsed.date, status: 'SKIPPED', detail: 'No Excel attachment' });
          await client.messageFlagsAdd(uid, ['\\Seen']);
          stats.skipped++;
          continue;
        }

        for (const att of xlsx) {
          try {
            const result = await importManifest(att.content, {
              source: 'email',
              filename: att.filename,
              emailFrom: from,
              emailSubject: subject,
            });
            await logIngest({
              uid, mailbox: mailboxKey, from, subject, receivedAt: parsed.date,
              status: result.ok ? 'PROCESSED' : 'ERROR',
              detail: result.ok
                ? `${result.flight.flight_number}: +${result.added} / ~${result.updated} / -${result.removed}`
                : result.error,
              manifestId: result.manifest?.id,
            });
            result.ok ? stats.processed++ : stats.errors++;
          } catch (err) {
            await logIngest({ uid, mailbox: mailboxKey, from, subject, receivedAt: parsed.date, status: 'ERROR', detail: err.message });
            stats.errors++;
          }
        }
        await client.messageFlagsAdd(uid, ['\\Seen']);
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('mail ingest error:', err.message);
    stats.errors++;
    try { await client.logout(); } catch { /* ignore */ }
  } finally {
    running = false;
  }
  return stats;
}

export function startMailIngest() {
  const loop = async () => {
    const imap = await getSetting('imap').catch(() => null);
    const interval = Math.max(30, imap?.poll_seconds || 120) * 1000;
    try {
      await pollOnce();
    } catch (err) {
      console.error('mail ingest loop error:', err.message);
    }
    timer = setTimeout(loop, interval);
  };
  loop();
  return () => clearTimeout(timer);
}
