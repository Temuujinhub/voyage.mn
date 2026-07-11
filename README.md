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

### Авто-deploy (санал болгох арга) — main руу merge хиймэгц шууд гарна

`.github/workflows/deploy.yml` нь `main` branch руу push/merge болмогц droplet руу
rsync-ээр код илгээж, docker compose-оор дахин build хийнэ. Нэг удаа л тохируулна:

1. Droplet дээр deploy key үүсгэх (өөрийн компьютерээс):
   ```bash
   ssh-keygen -t ed25519 -f voyage_deploy -N ""       # 2 файл үүснэ
   ssh root@157.245.203.209 "cat >> ~/.ssh/authorized_keys" < voyage_deploy.pub
   ```
2. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret** дээр дараах 7 secret-ийг нэмнэ:

   | Secret | Утга |
   |---|---|
   | `DROPLET_HOST` | `157.245.203.209` |
   | `DROPLET_USER` | `root` |
   | `DROPLET_SSH_KEY` | `voyage_deploy` файлын **бүтэн агуулга** (private key) |
   | `DB_PASSWORD` | `openssl rand -hex 24` |
   | `JWT_SECRET` | `openssl rand -hex 32` |
   | `QR_SECRET` | `openssl rand -hex 32` |
   | `ADMIN_PASSWORD` | Анхны админ нууц үг (өөрөө зохионо) |

3. Болоо. Одоо main руу merge бүр автоматаар deploy хийнэ (Actions таб дээр явцыг харна).
   Сервер дээрх `.env` анхны deploy үед secrets-ээс автоматаар үүснэ.

### Гараар deploy (эхний удаа эсвэл CI ашиглахгүй бол)

```bash
ssh root@157.245.203.209
git clone https://github.com/Temuujinhub/voyage.mn.git /opt/voyage
cd /opt/voyage
cp .env.example .env && nano .env        # доорх зааврын дагуу бөглөнө
bash deploy/deploy.sh                    # docker + nginx + firewall бүгдийг тохируулна
```

### .env бөглөх заавар

```ini
DB_PASSWORD=      # openssl rand -hex 24  → Postgres нууц үг (дотоод, хэнд ч өгөхгүй)
JWT_SECRET=       # openssl rand -hex 32  → нэвтрэлтийн токений түлхүүр
QR_SECRET=        # openssl rand -hex 32  → boarding pass QR гарын үсгийн түлхүүр
ADMIN_PASSWORD=   # анхны админ (admin) хэрэглэгчийн нууц үг — эхний нэвтрэлтийн дараа солино
PUBLIC_BASE_URL=https://voyage.mn
```
⚠️ `JWT_SECRET`/`QR_SECRET`-ийг дараа нь солибол бүх нэвтрэлт болон хэвлэгдсэн
boarding pass-ууд хүчингүй болно — нислэгийн дундуур бүү солиорой.

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
| OTP / SMS | `dev` горим (туршилт) эсвэл **CallPro Text API** — x-api-key, илгээгч дугаар (72xxxxxx). Баримт: `docs/CallPro_Text_API.txt` |

**Ажилтны буудал (station):** Хэрэглэгч бүрт UB (Чингис хаан) эсвэл OT (Ханбумбат) буудал
оноож болно — тухайн ажилтан нэвтрэхэд Check-in болон Gate дэлгэцүүд өөрийн буудлын
нислэгүүдээр автоматаар шүүгдэнэ. Буудалгүй хэрэглэгч бүх нислэгийг харна.

**Загварын сан:** `docs/design/` дотор 70+ брэндийн дизайн системийн тодорхойлолт
(VoltAgent/awesome-design-md, MIT) багтсан — UI хөгжүүлэлтэд лавлагаа болгож ашиглана.

## Стандартууд

- **IATA Resolution 792 (BCBP)** — QR доторх M1 формат мөр + HMAC-SHA256 гарын үсэг
- **IATA Resolution 740** — ачааны биркний 10 оронтой license plate, ITF (Interleaved 2 of 5) баркод
- Бүх үйлдэл `audit_log`-д бүртгэгдэнэ; нууц үг bcrypt; API rate-limit; Helmet CSP; TLS (certbot)

## Fujitsu биркний принтер

Бирк 470×51мм хуудас хэлбэрээр (`@page size: 470mm 51mm`) хэвлэгдэнэ. Check-in компьютер дээр
Fujitsu принтерийн драйверт custom paper size (470×51мм) нэг удаа бүртгээд, browser-ийн print
диалогоос тухайн принтерийг сонгоход шууд стандарт бирк гарна. (Боломжтой бол Chrome-ын
`--kiosk-printing` горимоор диалоггүй шууд хэвлэж болно.)
