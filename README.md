# ✈️ Voyage — Aero Mongolia E-Boarding System

Оюу Толгойн ажилчдыг тээвэрлэх Aero Mongolia-ийн захиалгат нислэгийн **вэб суурьтай e-boarding систем**.
Нислэгийн удирдлага, ОТ-ийн Excel manifest авто-импорт, check-in, IATA стандарт ачааны бирк,
бодит хэвлэмэл мэт харагдах e-boarding pass, 2 шатлалт QR скан, бодит цагийн dashboard.

**Урьдчилсан харагдац:** `voyage.mn` (хөгжүүлэлт дууссаны дараа холбогдоно) · Droplet: `157.245.203.209`

---

## Гол боломжууд

| Модуль | Тайлбар |
|---|---|
| **Нислэгийн удирдлага** | Нислэг үүсгэх/засах, төлөвийн урсгал: `SCHEDULED → CHECKIN_OPEN → BOARDING → DEPARTED` (+ хойшлолт, цуцлалт), charter/transport код (ж: `JU-1199 WED2`) |
| **Manifest импорт** | ОТ-ийн Excel форматыг (OTUB/UBOT файлууд) автоматаар таньж парс хийнэ. Гараар upload + **и-мэйлээс авто-импорт** (IMAP poller, 2 мин тутам). Transport Number + огноогоор нислэгтэй тулгана. **24ц–3ц цонх** мөрдөнө |
| **Check-in** | Лангуун дээр: суудал авто/гар сонголт, ачааны жин, илүү кг төлбөр, бирк хэвлэлт. Ачаагүй зорчигч онлайнаар өөрөө check-in хийнэ (утас + OTP) |
| **E-Boarding Pass** | IATA Res. 792 **BCBP** формат QR + HMAC гарын үсэг (хуурамчаас хамгаална). Хэвлэмэл ATB тасалбарын дизайн — perforation, stub, 187×83мм print |
| **Ачааны бирк** | IATA Res. 740 — 10 оронтой license plate, **Interleaved 2-of-5** баркод, 470×51мм thermal цаас (Fujitsu принтер), 3 байрлалд баркод |
| **Boarding скан** | 2 шатлал: Security → Gate. Давхар уншилт, security алгассан, буруу нислэг, хуурамч QR бүгд түгжигдэнэ. Камер эсвэл гар оруулалт |
| **Dashboard / Тайлан** | Бодит цагийн (Socket.IO) boarding явц, нислэг бүрийн ачаалал, Excel/PDF экспорт, бүрэн аудит лог |
| **Эрхийн 4 түвшин** | `admin` (бүрэн), `manager` (үйл ажиллагаа), `agent` (check-in/boarding), `ot_staff` (зөвхөн manifest) |

## Архитектур

```
client/   React 18 + Vite SPA  (staff портал + зорчигчийн self check-in)
server/   Node.js 22 + Express 5 + Socket.IO  (REST API, JWT auth, RBAC)
          PostgreSQL 16 (JSONB суудлын зураглал, аудит лог)
deploy/   nginx конфиг + deploy скрипт (DigitalOcean droplet)
```

- Суудлын зураглалууд: **JU-1188** (A319, 143), **JU-1199** (A319, 141) — бодит зургаас буулгасан, A/B/C бүс, нөөц/хаалттай суудлууд; **E145** (50). Автомат олголт: урдаас хойш дараалал, дараалал дуусвал random fallback.
- Бүх цагийг `Asia/Ulaanbaatar` (UTC+8)-аар харуулна; DB-д UTC хадгална.

## Хөгжүүлэлтийн орчин

```bash
# PostgreSQL 16 + Node 22 шаардлагатай
createdb voyage
cd server && npm install && npm run seed && npm start   # :4000
cd client && npm install && npm run dev                 # :5173 (proxy → 4000)
```

Анхны админ: `admin` / `ChangeMe#2026` (эсвэл `ADMIN_PASSWORD` env) — **эхний нэвтрэлтийн дараа солино уу**.

## Production deploy (DigitalOcean droplet)

```bash
ssh root@157.245.203.209
git clone https://github.com/Temuujinhub/voyage.mn.git /opt/voyage
cd /opt/voyage
cp .env.example .env && nano .env        # DB_PASSWORD, JWT_SECRET, QR_SECRET, ADMIN_PASSWORD
bash deploy/deploy.sh                    # docker + nginx + firewall бүгдийг тохируулна
```

Домэйн холбох (дараа нь): voyage.mn-ийн **A бичлэгийг** `157.245.203.209` рүү заагаад:

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d voyage.mn -d www.voyage.mn
```

Шинэчлэлт гаргах: `cd /opt/voyage && git pull && docker compose up -d --build`

## Ашиглалтын урсгал

1. **Админ/Менежер** нислэг үүсгэнэ (charter код = manifest-ийн Transport Number).
2. **ОТ аяллын ажилтан** manifest-аа и-мэйлээр илгээнэ (эсвэл ot_staff эрхээр upload) — нислэгээс 24–3 цагийн өмнө.
3. Систем manifest-ыг нислэгтэй тулгаж зорчигчдыг үүсгэнэ (шинэчлэлт ирвэл нэр солигдсоныг update, хасагдсаныг устгана).
4. Нислэг дээр **Check-in нээх** товч дарагдана.
5. Ачаагүй зорчигч утсаараа `voyage.mn/checkin-online` дээр OTP-оор өөрөө бүртгүүлж e-pass авна. Ачаатай нь лангуунд — жин, бирк, pass.
6. Security цэг QR-ыг 1-р скан, Gate дээр 2-р скан → `BOARDED`.
7. Dashboard бодит цагт; нислэг хаагдахад тайлан Excel/PDF-ээр татагдана.

## Тохиргоо (Систем → Тохиргоо, админ)

| Хэсэг | Юу оруулах |
|---|---|
| Агаарын тээвэрлэгч | Нэр, IATA код, биркний 3 оронтой код |
| Manifest цонх | 24ц / 3ц хязгаарууд |
| Ачааны норм | Үнэгүй кг, илүү кг-ийн тариф |
| IMAP | Manifest хүлээн авах mailbox (хост, порт, хэрэглэгч, нууц үг, зөвшөөрөгдсөн илгээгчид) |
| OTP / SMS | `dev` горим (туршилт) эсвэл SMS gateway URL + API key |

## Стандартууд

- **IATA Resolution 792 (BCBP)** — QR доторх M1 формат мөр + HMAC-SHA256 гарын үсэг
- **IATA Resolution 740** — ачааны биркний 10 оронтой license plate, ITF (Interleaved 2 of 5) баркод
- Бүх үйлдэл `audit_log`-д бүртгэгдэнэ; нууц үг bcrypt; API rate-limit; Helmet CSP; TLS (certbot)

## Fujitsu биркний принтер

Бирк 470×51мм хуудас хэлбэрээр (`@page size: 470mm 51mm`) хэвлэгдэнэ. Check-in компьютер дээр
Fujitsu принтерийн драйверт custom paper size (470×51мм) нэг удаа бүртгээд, browser-ийн print
диалогоос тухайн принтерийг сонгоход шууд стандарт бирк гарна. (Боломжтой бол Chrome-ын
`--kiosk-printing` горимоор диалоггүй шууд хэвлэж болно.)
