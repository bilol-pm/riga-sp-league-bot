# Riga Street Power Liga: ro'yxatdan o'tish (Telegram Mini App)

Rigadagi amatyor futbolchilar uchun Telegram bot va Mini App. O'yinchi bot orqali ilovani ochadi,
o'yinga yakka yoki jamoa bilan yoziladi. Adminlar o'yin qo'shadi va ro'yxatni ko'radi.
Ilova to'rt tilda ishlaydi: o'zbekcha, inglizcha, ruscha, latishcha.

## Loyiha qanday ishlaydi (3 qism)

```
  Telegram ──/start──► Backend (backend/, webhook) ──► "O'yinlar" tugmasi
                                            │
                                            ▼
  Frontend (index.html, css/, js/)  ◄──► Backend (backend/)  ◄──► D1 baza (SQLite)
  GitHub Pages'da turadi                Cloudflare Worker          Cloudflare'da
```

| Qism | Nima qiladi | Qayerda ishlaydi |
|---|---|---|
| **Frontend** (`index.html`, `css/`, `js/`, `assets/`) | Ilovaning ko'rinishi va ishlashi (Mini App) | GitHub Pages |
| **Backend** (`backend/`) | API: kim kirganini tekshiradi, o'yinlar va yozuvlarni saqlaydi | Cloudflare Worker + D1 baza |
| **Bot** (`backend/src/telegram.js`) | `/start` bosilganda Mini App'ni ochadigan tugma yuboradi. Backend ichida, shuning uchun 24/7 ishlaydi | Cloudflare Worker (webhook) |

Frontend serverga `js/api.js` orqali murojaat qiladi. Server har so'rovda Telegram imzosini (`initData`)
tekshiradi, shuning uchun boshqa odam nomidan yozib bo'lmaydi.

## Rollar

- **owner (asoschi)**: Telegram ID si backend'dagi `OWNER_IDS` o'zgaruvchisida. Hamma narsa + adminlarni qo'shish/o'chirish.
- **admin**: asoschi qo'shgan odam. O'yin qo'shadi/tahrirlaydi, hamma yozilganlarni, telefon/email'ni, nechta joy borligini ko'radi. O'zi o'yinga yozilmaydi.
- **player (o'yinchi)**: faqat o'z yozuvini ko'radi. Nechta odam yozilgani, sig'im va bo'sh joylar unga **umuman yuborilmaydi** (server `state.js` da kesadi).

## Fayllar tuzilmasi

```
riga-sp-league-bot/
├── index.html              Frontend kirish nuqtasi: faqat css va js fayllarni ulaydi
├── assets/
│   └── logo.webp           Liga logotipi
├── css/                    Uslublar (index.html dagi tartibda yuklanadi)
│   ├── base.css            Ranglar (o'zgaruvchilar), umumiy qoidalar, sahifa maketi
│   ├── header.css          Tepa qism: logo, nom, til tanlagich
│   ├── components.css      Kartalar, tugmalar, teglar, ro'yxat qatorlari, statistika
│   ├── menu.css            Profil/admin menyusi
│   ├── forms.css           Formalar va kiritish maydonlari
│   ├── calendar.css        Hafta kalendari
│   ├── nav.css             Pastki menyu va xabar (toast)
│   └── responsive.css      Kichik ekranlar
├── js/                     Frontend kodi (tartib bilan yuklanadi, tartib index.html da)
│   ├── config.js           Server manzili va o'zgarmaslar
│   ├── telegram.js         Telegram WebApp: foydalanuvchi, initData
│   ├── i18n/
│   │   ├── locales/en.js   Inglizcha tarjimalar
│   │   ├── locales/ru.js   Ruscha tarjimalar
│   │   ├── locales/lv.js   Latishcha tarjimalar
│   │   ├── i18n.js         Tilni tanlash va t() funksiyasi
│   │   └── dates.js        Sana/oy/hafta kunlari to'rt tilda
│   ├── utils.js            Kichik yordamchilar (esc, sana, telefon +371 va email tekshirish)
│   ├── storage.js          localStorage: profil va yozilgan o'yinlar tarixi
│   ├── state.js            Ilovaning yagona holati (state) va rol yordamchilari
│   ├── api.js              Server bilan aloqa: api(), refresh(), act()
│   ├── ui/
│   │   ├── components.js   Logo, header, til tanlagich, tugma, belgi (badge)
│   │   ├── calendar.js     Hafta kalendari
│   │   └── render.js       render() + toast, tasdiqlash oynasi, teskari sanoq
│   ├── views/              Sahifalar (har biri HTML satr qaytaradi)
│   │   ├── games.js        "Asosiy"
│   │   ├── detail.js       O'yin ichi (ro'yxat)
│   │   ├── form.js         Ro'yxatdan o'tish formasi
│   │   ├── mine.js         "Yozilganlar"
│   │   ├── profile.js      "Profil"
│   │   ├── admin.js        Admin bo'limi (profil ichida)
│   │   └── admin-form.js   O'yin qo'shish/tahrirlash formasi
│   ├── actions/
│   │   ├── forms.js        Formalarni tekshirish va yuborish
│   │   └── events.js       Barcha bosishlar va kiritishlar (data-a="..." bo'yicha)
│   └── main.js             Ishga tushirish
├── backend/                Server (Cloudflare Worker)
│   ├── src/
│   │   ├── index.js        Kirish nuqtasi: so'rovni yo'naltiradi
│   │   ├── config.js       O'zgarmaslar (jamoa hajmi va h.k.)
│   │   ├── http.js         Xato sinfi, JSON javob, CORS, so'rovni o'qish
│   │   ├── utils.js        Matn tozalash, son o'qish
│   │   ├── db.js           Jadvallarni yaratish va eski bazaga yangi ustun qo'shish (games, registrations, admins, strikes, blocks)
│   │   ├── auth.js         Telegram imzosini tekshirish, rollar
│   │   ├── state.js        Holatni yig'ish; maxfiylik shu yerda
│   │   ├── queue.js        Navbat hisobi: kim ro'yxatda, kim kutmoqda
│   │   ├── notify.js       O'yinchiga xabarlar: tasdiq, 24 soat oldin eslatma, ogohlantirish, blok (matnlar 4 tilda)
│   │   ├── validate.js     Telefon (+371) va email tekshirish, bir odamni aniqlash kalitlari
│   │   ├── moderation.js   Davomat (keldi/kelmadi), ogohlantirish, avtomatik blok, blokni ochish
│   │   ├── rules.js        O'yin qoidalari matni: eslatma xabarining oxiriga qo'shiladi (hozircha bo'sh)
│   │   ├── telegram.js     Bot: /start ga javob (webhook) va bir martalik sozlash
│   │   └── routes/
│   │       ├── index.js    Manzillar jadvali (manzil → funksiya)
│   │       ├── player.js   Yozilish va chiqish
│   │       ├── games.js    Admin: o'yin qo'shish/tahrirlash/o'chirish, yozuvni o'chirish
│   │       └── admins.js   Asoschi: adminlarni boshqarish
│   ├── scripts/build.mjs   src/ ni bitta faylga yig'adi
│   ├── dist/worker.js      Yig'ilgan fayl (Cloudflare paneliga shu qo'yiladi)
│   ├── wrangler.toml       Cloudflare sozlamasi: avtomatik joylash shu fayl bo'yicha ishlaydi
│   └── package.json
├── scripts/bump-version.mjs  CSS/JS keshini yangilash uchun versiya raqamini oshiradi
├── bot.py                  ESKI variant: kompyuterda ishlaydigan bot (faqat sinash uchun, pastga qarang)
├── requirements.txt        bot.py uchun Python paketlari
├── .env.example            bot.py sozlamalari namunasi (.env ga nusxalang)
└── README.md
```

## Qayerda nimani o'zgartiraman?

| Nima kerak | Qaysi fayl |
|---|---|
| Server manzilini almashtirish | `js/config.js` (`API_BASE`) |
| Jamoadagi o'yinchilar soni | `js/config.js` va `backend/src/config.js` (`TEAM_SIZE`, ikkalasida bir xil bo'lsin) |
| Ranglar | `css/base.css` (yuqoridagi `--bg`, `--blue` va h.k.) |
| Matn yoki tarjima | `js/i18n/locales/en.js`, `ru.js`, `lv.js` (kalit, ya'ni o'zbekcha matn, kod ichida `t("...")` da) |
| Yangi til qo'shish | yangi `locales/xx.js` + `i18n.js` dagi `LANGS`, `I18N` va `dates.js` |
| "Asosiy" sahifa ko'rinishi | `js/views/games.js` |
| Ro'yxatdan o'tish formasi | `js/views/form.js` (ko'rinishi), `js/actions/forms.js` (tekshirish) |
| Yangi tugma qo'shish | HTML ga `data-a="nom"`, `js/actions/events.js` ga shu nom uchun qator |
| Admin menyusi | `js/views/admin.js` |
| Telefon (+371) va email tekshirish | server: `backend/src/validate.js`, ekran: `js/utils.js` (qoidalar bir xil) |
| Davomat (keldi/kelmadi), ogohlantirish, blok | `backend/src/moderation.js`; sonlar: `backend/src/config.js` (`STRIKES_TO_BLOCK`, `BLOCK_DAYS`) va `js/config.js` (`STRIKES_TO_BLOCK`) |
| Ogohlantirish / blok xabari matni | `backend/src/notify.js` (`MOD` jadvali, 4 til) |
| Kim nimani ko'ra oladi | `backend/src/state.js` |
| O'yin qoidalari (eslatmada ko'rinadi) | `backend/src/rules.js` (har til uchun alohida matn) |
| Tasdiq / eslatma xabari matni, eslatma vaqti | matn: `backend/src/notify.js` (`MSG`), vaqt: `backend/src/config.js` (`REMIND_BEFORE_MS`) |
| Yangi API manzil | `backend/src/routes/` ga funksiya + `routes/index.js` ga qator |

## Qanday ishga tushiriladi

### 1. Frontend (GitHub Pages)
Repozitoriyga push qilinadi, GitHub Pages `main` filialidan `/ (root)` ni ko'rsatadi:
```
git add .
git commit -m "..."
git push
```
Brauzer eski fayllarni eslab qolmasligi uchun, CSS/JS o'zgargan bo'lsa push qilishdan oldin:
```
node scripts/bump-version.mjs
```
Telegram'da ko'rish: ⋮ → Reload Page (GitHub Pages 1–3 daqiqa kechikishi mumkin).

### 2. Backend (Cloudflare)
Cloudflare'da (bir marta sozlanadi): D1 baza `riga-sp-league` → Worker'ga `DB` nomi bilan ulanadi;
o'zgaruvchilar: `BOT_TOKEN` (Secret), `OWNER_IDS` (asoschi Telegram ID si), `ALLOWED_ORIGIN` (`https://bilol-pm.github.io`),
`WEBHOOK_SECRET` (Secret, o'zingiz o'ylab topgan uzun matn: faqat harf, raqam, `_`, `-`).

Kodni o'zgartirgandan keyin:
```
cd backend
node scripts/build.mjs
```
Chiqqan `backend/dist/worker.js` faylining hammasini Cloudflare → Workers → `riga-sp-api` → Edit code ga
nusxalab qo'yib, **Deploy** bosiladi. (Node.js 18+ kerak; hech narsa o'rnatish shart emas.)
Tekshirish: `https://riga-sp-api.bilolpm111.workers.dev/` da `"ready": true` chiqishi kerak.

### 3. Bot (/start javobi): bir marta sozlanadi
`/start` ga javobni backend beradi, kompyuterda hech narsa ishlab turishi shart emas.
1. Cloudflare'ga `WEBHOOK_SECRET` ni qo'shing va backend'ni Deploy qiling (yuqoridagi 2-qadam).
2. Brauzerda bir marta oching (Telegram'ga webhook va menyu tugmasini o'rnatadi):
   `https://riga-sp-api.bilolpm111.workers.dev/telegram/setup?secret=SIZNING_WEBHOOK_SECRET`
   Javobda `"ok":true` chiqishi kerak.
3. Botga `/start` yozib tekshiring.

Javob BITTA xabar: o'zbekcha, inglizcha, ruscha va latishcha matn ketma-ket (`backend/src/telegram.js` dagi `WELCOME`), tagida bitta tugma (`BUTTON`).

**`bot.py` haqida:** u eski variant (kompyuterda ishlaydi, `getUpdates` bilan). Webhook o'rnatilgandan keyin
uni ishga tushirmang: Telegram bir vaqtda ikkala usulni ruxsat bermaydi (`Conflict` xatosi chiqadi).
Faqat webhook'ni o'chirib, mahalliy sinash uchun kerak bo'ladi.

### 4. Eslatmalar (Cron Trigger): bir marta sozlanadi
Bot o'yinchiga ikki xil xabar yuboradi (bot bilan chatiga):
- **Ro'yxatdan o'tishi bilan:** qaysi sana va soatga yozilgani (navbatda bo'lsa, boshqa matn).
- **O'yindan roppa-rosa 24 soat oldin:** "siz futbolga yozilgansiz, kechikmasdan keling" eslatmasi.

Tasdiq xabari o'zi ketadi. Eslatma uchun Cloudflare vaqti-vaqti bilan serverni uyg'otishi kerak:
1. Cloudflare → Workers → `riga-sp-api` → **Settings** → **Triggers** → **Cron Triggers** → **Add**.
2. Cron: `*/5 * * * *` (har 5 daqiqada) → **Add**.

Qoidalar: xabar odam yozilganda ilovada tanlagan tilida ketadi; sana va soat Riga vaqti bilan; navbatdagilarga
eslatma yuborilmaydi (ular ro'yxatga o'tgach oladi); ro'yxatdan chiqqan odamga ketmaydi; o'yin vaqti o'zgarsa,
eslatma yangi vaqtga qarab qayta yuboriladi; o'yinga 24 soatdan kam qolganda yozilganga faqat tasdiq xabari ketadi.
Botni bloklagan yoki bot bilan hech qachon gaplashmagan odamga xabar bormaydi (bu xato emas, o'tkazib yuboriladi).

### 5. Avtomatik joylash (bir marta sozlanadi)
Cloudflare GitHub'ga ulanadi va `main` ga har push'dan keyin serverni o'zi yangilaydi (kodni panelga qo'lda qo'yish shart emas):
1. Cloudflare → Workers & Pages → `riga-sp-api` → **Settings** → **Builds** → **Connect** → GitHub → `riga-sp-league-bot`.
2. Production branch: `main`. Root directory: `backend`. Build command: bo'sh. Deploy command: `npx wrangler deploy`.

Sozlamalar `backend/wrangler.toml` da (baza, `OWNER_IDS`, `ALLOWED_ORIGIN`, har 5 daqiqalik Cron). Parollar (`BOT_TOKEN`,
`WEBHOOK_SECRET`) faylga yozilmaydi, panelda Secret bo'lib turadi. `backend/dist/worker.js` endi faqat zaxira
(Cloudflare ulanmay qolsa, qo'lda qo'yish uchun).

## Muhim qoidalar (biznes mantiq)

- O'yinlar odatda shanba/yakshanba. Jamoa = 7 kishi, bitta o'yinda 3–4 jamoa; standart sig'im 28.
- Sig'imdan oshsa yozilgan odam **navbat ro'yxatiga** tushadi. Navbat serverda `created_at` tartibida hisoblanadi
  (bazada saqlanmaydi): kimdir chiqib ketsa, navbatdagi avtomatik kiradi.
- Yozilish formasi: **Jamoam bor** (jamoa nomi ixtiyoriy, 7 ta ism, kapitan ⭐, kapitan telefoni) yoki
  **Yakka o'zim** (ism, telefon, email).
- **Telefon**: faqat Latviya raqami, `+371` va 8 ta raqam (`+371XXXXXXXX` ko'rinishida saqlanadi). **Email**: shakli tekshiriladi,
  mashhur domen xato yozilsa (gmail.con, gmial.com, icloud.co...) to'g'ri variant taklif qilinadi.
- **Davomat va blok**: o'yin boshlangach admin (Profil → Ro'yxatdan o'tganlar → "O'tgan o'yinlar") har bir yozilganni "Keldi" yoki
  "Kelmadi" deb belgilaydi (navbatdagilar belgilanmaydi). Birinchi "Kelmadi": o'yinchiga ogohlantirish xabari, adminda ⚠️ 1.
  Ikkinchi "Kelmadi": akkaunt belgilangan paytdan 1 haftaga avtomatik bloklanadi, shu davrdagi o'yinlarga yozuvlari bekor qilinadi.
  Blokdan keyin hisob yangidan boshlanadi. Bir odam Telegram ID, telefon yoki email bo'yicha aniqlanadi (gmail nuqtalari va `+yorliq`
  e'tiborga olinmaydi), shuning uchun yangi akkaunt ochib aylanib o'tib bo'lmaydi. Admin belgini qaytarib olsa, ogohlantirish va
  u keltirgan blok ham olib tashlanadi; "Bloklanganlar" bo'limida blokni qo'lda ochish mumkin.
- Profil ma'lumotlari va "yozilgan o'yinlarim" tarixi hozircha faqat shu qurilmaning `localStorage` ida saqlanadi.

## Kod yozish qoidalari (bu loyihada)

- Frontend'da build/bundler yo'q: oddiy `<script>` fayllar, `index.html` dagi tartib bilan yuklanadi.
  Yangi fayl qo'shsangiz, uni `index.html` ga to'g'ri joyga yozing (u ishlatadigan fayllardan keyin).
- Foydalanuvchi kiritgan har qanday matn HTML ga qo'yishdan oldin `esc()` dan o'tkaziladi.
- Backend'da `src/` dagi modullar orasida bir xil nomli funksiya/o'zgaruvchi bo'lmasin (yig'uvchi skript shuni talab qiladi).
