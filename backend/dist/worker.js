// DIQQAT: bu fayl avtomatik yaratilgan (node scripts/build.mjs). Qo'lda tahrirlamang:
// o'zgartirish kerak bo'lsa src/ ichidagi fayllarni tahrirlab, qayta yig'ing.

// ===== src/config.js =====
/**
 * Server sozlamalari (o'zgarmas qiymatlar).
 * Cloudflare'dagi o'zgaruvchilar (DB, BOT_TOKEN, OWNER_IDS, ALLOWED_ORIGIN) bu yerda emas:
 * ular Cloudflare panelida kiritiladi, kodda `env.NOM` orqali o'qiladi.
 */
const TEAM_SIZE = 7;                    // bitta jamoadagi o'yinchilar soni
const MAX_AUTH_AGE = 3 * 24 * 3600;     // Telegram imzosi necha soniya amal qiladi
const HISTORY_DAYS = 8;                 // o'tgan o'yinlar necha kun ko'rsatiladi
const MAX_BODY_BYTES = 20000;           // so'rov hajmi chegarasi
const DEFAULT_TITLE = "Futbol o'yini";  // admin sarlavha yozmasa
const DEFAULT_ORIGIN = 'https://bilol-pm.github.io';   // ALLOWED_ORIGIN berilmasa
const DEFAULT_WEBAPP_URL = 'https://bilol-pm.github.io/riga-sp-league-bot/';   // Mini App manzili (WEBAPP_URL berilmasa)
const TIMEZONE = 'Europe/Riga';        // xabarlarda sana va soat shu vaqt mintaqasida yoziladi
const REMIND_BEFORE_MS = 24 * 3600 * 1000;   // eslatma o'yindan necha soat oldin ketadi (24 soat)
const REMIND_BATCH = 40;                // bitta cron ishga tushishida eng ko'pi bilan nechta xabar (Cloudflare bepul limiti)
const STRIKES_TO_BLOCK = 2;             // nechta "kelmadi"dan keyin o'yinchi avtomatik bloklanadi
const BLOCK_DAYS = 7;                   // blok muddati (kun): 7 = 1 hafta

// ===== src/http.js =====
/** HTTP qatlami: xato sinfi, JSON javob, CORS, so'rov tanasini o'qish. */

class HttpError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;   // ixtiyoriy: javobga qo'shiladigan qo'shimcha maydonlar (masalan, blok muddati)
  }
}

// Faqat ruxsat etilgan saytlar (ALLOWED_ORIGIN) API'ga murojaat qila oladi
function corsHeaders(env, req) {
  const allowed = String(env.ALLOWED_ORIGIN || DEFAULT_ORIGIN)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get('Origin') || '';
  const h = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Init-Data',
    'Access-Control-Max-Age': '86400',
  };
  if (allowed.includes('*')) h['Access-Control-Allow-Origin'] = '*';
  else if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

const json = (data, status, extra) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

async function readBody(req) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY_BYTES) throw new HttpError(413, "So'rov juda katta");
  let b;
  try {
    b = await req.json();
  } catch (e) {
    throw new HttpError(400, "Noto'g'ri so'rov");
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, "Noto'g'ri so'rov");
  return b;
}

// ===== src/db.js =====
/**
 * Ma'lumotlar bazasi (Cloudflare D1 = SQLite).
 * Jadvallar birinchi so'rovda o'zi yaratiladi (CREATE TABLE IF NOT EXISTS),
 * shuning uchun qo'lda SQL yozish shart emas.
 *
 *   games          o'yinlar (sana, joy, sig'im)
 *   registrations  ro'yxatdan o'tishlar (yakka yoki jamoa)
 *   admins         adminlar (asoschi bu jadvalda emas, u OWNER_IDS da)
 *   strikes        "kelmadi" belgilari (har bir kelmagan yozuv uchun bitta)
 *   blocks         bloklangan o'yinchilar (muddati bilan)
 *
 * Eski bazaga yangi ustunlar (lang, reminded, attended, marked_at) ham o'zi qo'shiladi (migrate).
 */
// Har bir baza uchun jadvallar bir marta tekshiriladi (sinovda bir nechta baza bo'lishi mumkin)
const schemaDone = new WeakMap();

function ensureSchema(env) {
  const db = env.DB;
  let schemaPromise = schemaDone.get(db);
  if (!schemaPromise) {
    schemaPromise = db
      .batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          place TEXT NOT NULL DEFAULT '',
          map_url TEXT NOT NULL DEFAULT '',
          capacity INTEGER NOT NULL DEFAULT 28,
          created_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS registrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_id INTEGER NOT NULL,
          uid INTEGER NOT NULL,
          tg_username TEXT NOT NULL DEFAULT '',
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          members TEXT NOT NULL DEFAULT '[]',
          captain INTEGER NOT NULL DEFAULT 0,
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          UNIQUE (game_id, uid)
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS admins (
          uid INTEGER PRIMARY KEY,
          name TEXT NOT NULL DEFAULT '',
          added_by INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS strikes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reg_id INTEGER NOT NULL UNIQUE,
          game_id INTEGER NOT NULL,
          uid INTEGER NOT NULL,
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          block_id INTEGER,
          created_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS blocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uid INTEGER NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          strike_reg_id INTEGER NOT NULL,
          until_ts INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_games_ts ON games (ts)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_reg_game ON registrations (game_id)'),
      ])
      .then(() => migrate(env))
      .catch((e) => {
        schemaDone.delete(db);
        throw e;
      });
    schemaDone.set(db, schemaPromise);
  }
  return schemaPromise;
}

// Eski bazada yo'q ustunlarni qo'shadi (CREATE TABLE IF NOT EXISTS mavjud jadvalni o'zgartirmaydi)
//   lang      yozilgan odamning tili (uz / en / ru / lv): xabar shu tilda ketadi
//   reminded  eslatma holati: 0 = hali yuborilmagan, 1 = yuborildi, 2 = yuborib bo'lmadi (bot bloklangan)
//   attended  admin belgisi: NULL = belgilanmagan, 1 = keldi, 0 = kelmadi
//   marked_at belgilangan vaqt
async function migrate(env) {
  const cols = (await env.DB.prepare('PRAGMA table_info(registrations)').all()).results.map((c) => c.name);
  const add = [];
  if (!cols.includes('lang')) add.push("ALTER TABLE registrations ADD COLUMN lang TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('reminded')) add.push('ALTER TABLE registrations ADD COLUMN reminded INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('attended')) add.push('ALTER TABLE registrations ADD COLUMN attended INTEGER');
  if (!cols.includes('marked_at')) add.push('ALTER TABLE registrations ADD COLUMN marked_at INTEGER');
  for (const sql of add) {
    try {
      await env.DB.prepare(sql).run();
    } catch (e) {
      if (!/duplicate column/i.test(String((e && e.message) || e))) throw e;   // boshqa nusxa allaqachon qo'shgan
    }
  }
}

// ===== src/utils.js =====
/** Kichik yordamchi funksiyalar: matn tozalash, son o'qish, JSON xavfsiz o'qish. */

// Boshqaruv belgilarini olib tashlaydi va chetlarini kesadi
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
// Matnni tozalab, eng ko'pi bilan `max` belgigacha qisqartiradi
const str = (v, max) => clean(v).slice(0, max);
// Butun son yoki NaN (noto'g'ri bo'lsa)
const int = (v) =>
  (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v)
    ? Math.trunc(+v)
    : NaN;
// "123, 456" -> [123, 456]
const parseIds = (s) =>
  String(s || '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
const safeJson = (s, fallback) => {
  try {
    const v = JSON.parse(s);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
};
// Vaqtga bog'liq bo'lmagan satr solishtirish (imzoni tekshirishda)
const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

// ===== src/auth.js =====
/**
 * Kimligini aniqlash va rollar.
 *   1) Telegram Mini App har so'rovda X-Init-Data yuboradi; uni BOT_TOKEN bilan HMAC orqali tekshiramiz.
 *   2) Rol: owner (OWNER_IDS), admin (admins jadvali) yoki player.
 */



async function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const enc = new TextEncoder();
  const hmac = async (keyBytes, data) => {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', key, enc.encode(data));
  };
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const sig = new Uint8Array(await hmac(secret, check));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!safeEqual(hex, hash.toLowerCase())) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE) return null;
  const user = safeJson(params.get('user'), null);
  if (!user || !Number.isInteger(user.id)) return null;
  return user;
}

// So'rov egasini qaytaradi: { id, name, username, role } yoki null (Telegramsiz brauzer)
async function getMe(req, env) {
  const raw = req.headers.get('X-Init-Data');
  if (!raw) return null;
  const user = await verifyInitData(raw, env.BOT_TOKEN);
  if (!user) throw new HttpError(401, 'Sessiya eskirgan. Ilovani yopib, qayta oching.');
  let role = 'player';
  if (parseIds(env.OWNER_IDS).includes(user.id)) role = 'owner';
  else if (await env.DB.prepare('SELECT 1 AS x FROM admins WHERE uid = ?').bind(user.id).first()) role = 'admin';
  return {
    id: user.id,
    name: str([user.first_name, user.last_name].filter(Boolean).join(' '), 80),
    username: str(user.username || '', 40),
    tgLang: str(user.language_code || '', 10),   // Telegram tili (xabar tilini tanlash uchun)
    role,
  };
}

const isAdminRole = (me) => !!me && (me.role === 'owner' || me.role === 'admin');

const needLogin = (me) => {
  if (!me) throw new HttpError(401, "Telegram ichida oching, shunda ro'yxatdan o'tish mumkin.");
};
const needAdmin = (me) => {
  needLogin(me);
  if (!isAdminRole(me)) throw new HttpError(403, 'Bu amal faqat adminlar uchun.');
};
const needOwner = (me) => {
  needLogin(me);
  if (me.role !== 'owner') throw new HttpError(403, "Bu amal faqat asoschi uchun.");
};

// ===== src/queue.js =====
/**
 * Navbat (kutish ro'yxati) hisobi: yozilganlar created_at tartibida sanaladi; sig'imga sig'magan yozuv
 * "wait" bo'ladi. Bu har safar hisoblanadi, bazada saqlanmaydi. state.js va notify.js shundan foydalanadi.
 * `regs` created_at, id tartibida kelishi shart.
 */

function seatRegs(regs, capacity) {
  let used = 0;
  let waiting = 0;
  const rows = regs.map((r) => {
    const members = safeJson(r.members, []);
    const size = r.kind === 'team' ? members.length : 1;
    let wait = false;
    if (used + size <= capacity) used += size;
    else {
      wait = true;
      waiting += size;
    }
    return { r, members, size, wait };
  });
  return { rows, used, waiting };
}

// ===== src/rules.js =====
/**
 * O'yin qoidalari: eslatma xabarining oxiriga "📋 O'yin qoidalari" bo'limi bo'lib qo'shiladi.
 * Har bir til uchun alohida matn yozing (oddiy matn, bir necha qator bo'lishi mumkin).
 * Bo'sh qoldirilgan tilda bu bo'lim umuman chiqmaydi.
 */
const GAME_RULES = {
  uz: '',
  en: '',
  ru: '',
  lv: '',
};

// ===== src/telegram.js =====
/**
 * Telegram bot qismi: /start ga javob (webhook). Kompyuterda bot.py ishlab turishi shart emas.
 *
 *   POST /telegram/webhook   Telegram yangilanishlarni shu manzilga yuboradi
 *   GET  /telegram/setup     BIR MARTA ochiladi: webhook va menyu tugmasini Telegram'da o'rnatadi
 *
 * Cloudflare'da kerak: BOT_TOKEN (bor), WEBHOOK_SECRET (Secret, o'zingiz o'ylab topgan uzun matn:
 * faqat harf, raqam, _ va -). Ixtiyoriy: WEBAPP_URL.
 */



// /start javobi: BITTA xabar, hamma tillar ketma-ket (o'zbekcha birinchi). Tilni aniqlash shart emas.
// Matnni o'zgartirmoqchi bo'lsangiz, faqat shu yerni tahrirlang.
const WELCOME = [
  '⚽ Riga Street Power League',
  "🇺🇿 Assalomu alaykum! Riga Street Power Ligasiga xush kelibsiz. Futbol o'yiniga ro'yxatdan o'tish uchun pastdagi tugmani bosing.",
  '🇬🇧 Welcome to Riga Street Power League! Tap the button below to register for a football game.',
  '🇷🇺 Добро пожаловать в Riga Street Power League! Чтобы записаться на футбольную игру, нажмите кнопку ниже.',
  '🇱🇻 Laipni lūdzam Riga Street Power League! Lai pieteiktos futbola spēlei, nospiediet pogu zemāk.',
].join('\n\n');
const BUTTON = "⚽ O'yinlar · Games · Игры · Spēles";   // inline tugma (hamma tilda)
const MENU_BUTTON = "⚽ O'yinlar";                     // chap pastdagi menyu tugmasi

const webAppUrl = (env) => String(env.WEBAPP_URL || DEFAULT_WEBAPP_URL);

// Telegram Bot API ga so'rov
async function tgCall(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

const sameSecret = (given, env) => !!env.WEBHOOK_SECRET && safeEqual(String(given || ''), String(env.WEBHOOK_SECRET));

// Telegram yuborgan yangilanish: private chatdagi /start ga tugma bilan javob beramiz
async function onWebhook(req, env) {
  if (!env.WEBHOOK_SECRET) throw new HttpError(500, 'WEBHOOK_SECRET sozlanmagan');
  // Faqat Telegram bilishi mumkin bo'lgan maxfiy so'z bilan kelgan so'rovlar qabul qilinadi
  if (!sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), env)) throw new HttpError(401, 'Ruxsat yo\'q');

  let update = null;
  try {
    update = await req.json();
  } catch (e) {}
  const msg = update && update.message;
  const isStart = msg && typeof msg.text === 'string' && /^\/start(@\w+)?(\s|$)/.test(msg.text);
  if (isStart && msg.chat && msg.chat.type === 'private') {
    try {
      await tgCall(env, 'sendMessage', {
        chat_id: msg.chat.id,
        text: WELCOME,
        reply_markup: { inline_keyboard: [[{ text: BUTTON, web_app: { url: webAppUrl(env) } }]] },
      });
    } catch (e) {
      console.error(e);   // Telegram qayta-qayta yubormasligi uchun baribir 200 qaytaramiz
    }
  }
  return { ok: true };
}

// Bir marta: webhook'ni o'rnatadi va chap pastdagi menyu tugmasini qo'yadi
async function onSetup(req, env) {
  const url = new URL(req.url);
  if (!sameSecret(url.searchParams.get('secret'), env)) throw new HttpError(403, "Maxfiy so'z noto'g'ri yoki WEBHOOK_SECRET sozlanmagan");
  const webhook = await tgCall(env, 'setWebhook', {
    url: `${url.origin}/telegram/webhook`,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ['message'],
  });
  const menu = await tgCall(env, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: MENU_BUTTON, web_app: { url: webAppUrl(env) } },
  });
  return { ok: !!(webhook.ok && menu.ok), webhook, menu };
}

// index.js dan chaqiriladi: /telegram/... yo'llari
async function handleTelegram(req, env, path, ch) {
  if (!env.BOT_TOKEN) throw new HttpError(500, 'BOT_TOKEN sozlanmagan');
  if (path === '/telegram/webhook' && req.method === 'POST') return json(await onWebhook(req, env), 200, ch);
  if (path === '/telegram/setup' && req.method === 'GET') return json(await onSetup(req, env), 200, ch);
  throw new HttpError(404, 'Topilmadi');
}

// ===== src/notify.js =====
/**
 * O'yinchiga Telegram bot orqali xabar yuborish (bot bilan chatiga):
 *   1) Ro'yxatdan o'tishi bilan: "siz mana shu sana va vaqtga yozildingiz" (tasdiq xabari)
 *   2) O'yindan roppa-rosa 24 soat oldin: "siz futbolga yozilgansiz, kechikmasdan keling" (eslatma)
 *
 * Eslatmani Cloudflare Cron Trigger ishga tushiradi (index.js dagi `scheduled`), har 5 daqiqada.
 * Xabar odam yozilganda tanlagan tilida ketadi (uz / en / ru / lv).
 * Matnlarni o'zgartirish: pastdagi MSG jadvalida.
 *
 * Yana ikki xabar (moderatsiya): birinchi "kelmadi"da OGOHLANTIRISH, ikkinchisida BLOK xabari (MOD jadvali).
 */





const LANG_CODES = ['uz', 'en', 'ru', 'lv'];

// Telegram til kodidan til tanlash (ilovadagi qoida bilan bir xil)
function langFrom(code) {
  const c = String(code || '').toLowerCase();
  if (c.startsWith('uz')) return 'uz';
  if (c.startsWith('ru')) return 'ru';
  if (c.startsWith('lv')) return 'lv';
  return c ? 'en' : 'uz';
}
// Mijoz yuborgan til to'g'ri bo'lsa o'sha, bo'lmasa Telegram tili
const pickLang = (sent, tgCode) => (LANG_CODES.includes(sent) ? sent : langFrom(tgCode));

const DAYS = {
  uz: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  lv: ['Svētdiena', 'Pirmdiena', 'Otrdiena', 'Trešdiena', 'Ceturtdiena', 'Piektdiena', 'Sestdiena'],
};
const MONTHS = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  lv: ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'],
};

// Xabar matnlari. head = qalin sarlavha, foot = oxirgi gap. kind: in (yozildi), wait (navbatda), remind (eslatma)
const MSG = {
  uz: {
    game: "Futbol o'yini",
    in: { head: "✅ Ro'yxatdan o'tdingiz!", foot: "Iltimos, kechikmasdan keling. Ko'rishguncha! 👋" },
    wait: { head: '⏳ Siz navbat ro\'yxatidasiz', foot: "Hozircha joy yetarli emas. Joy bo'shasa, ro'yxatga o'tasiz. Holatni ilovada ko'rishingiz mumkin." },
    remind: {
      head: "⏰ Futbol o'yini eslatmasi",
      greet: '👋 Assalomu alaykum!',
      intro: "Eslatib o'tamiz: siz futbol o'yiniga yozilgansiz. O'yin haqida ma'lumot:",
      foot: "Iltimos, kechikmasdan keling va o'yinni o'tkazib yubormang! 🙌\nKela olmasangiz, ilovada ro'yxatdan chiqing, boshqa o'yinchilarga joy bo'shaydi. Aks holda siz bloklanishingiz mumkin.",
    },
    label: { game: "⚽ O'yin", date: '📅 Kun', time: '🕗 Soat', place: '📍 Joy' },
    rules: "📋 O'yin qoidalari",
    open: '📋 Ilovani ochish',
    map: "📍 Xaritada ko'rish",
  },
  en: {
    game: 'Football game',
    in: { head: "✅ You're registered!", foot: 'Please arrive on time. See you there! 👋' },
    wait: { head: "⏳ You're on the waiting list", foot: "There aren't enough spots right now. If a spot opens up, you'll move onto the list. You can check your status in the app." },
    remind: {
      head: '⏰ Football game reminder',
      greet: '👋 Hello!',
      intro: "Just a reminder: you're signed up for a football game. Game details:",
      foot: "Please don't be late and don't miss the game! 🙌\nIf you can't make it, cancel your registration in the app so other players can take your spot. Otherwise, you may be blocked.",
    },
    label: { game: '⚽ Game', date: '📅 Date', time: '🕗 Time', place: '📍 Location' },
    rules: '📋 Game rules',
    open: '📋 Open the app',
    map: '📍 View on map',
  },
  ru: {
    game: 'Футбольная игра',
    in: { head: '✅ Вы записаны!', foot: 'Пожалуйста, приходите вовремя. До встречи! 👋' },
    wait: { head: '⏳ Вы в списке ожидания', foot: 'Сейчас мест недостаточно. Если место освободится, вы попадёте в список. Статус можно посмотреть в приложении.' },
    remind: {
      head: '⏰ Напоминание об игре',
      greet: '👋 Здравствуйте!',
      intro: 'Напоминаем: вы записаны на футбольную игру. Информация об игре:',
      foot: 'Пожалуйста, не опаздывайте и не пропустите игру! 🙌\nЕсли не сможете прийти, отмените запись в приложении, чтобы место досталось другим игрокам. В противном случае вас могут заблокировать.',
    },
    label: { game: '⚽ Игра', date: '📅 Дата', time: '🕗 Время', place: '📍 Место' },
    rules: '📋 Правила игры',
    open: '📋 Открыть приложение',
    map: '📍 Показать на карте',
  },
  lv: {
    game: 'Futbola spēle',
    in: { head: '✅ Pieteikšanās veiksmīga!', foot: 'Lūdzu, ierodieties laikā. Uz tikšanos! 👋' },
    wait: { head: '⏳ Jūs esat gaidīšanas sarakstā', foot: 'Pašlaik nepietiek vietu. Ja vieta atbrīvosies, pieteikums tiks pārcelts uz sarakstu. Statusu varat apskatīt lietotnē.' },
    remind: {
      head: '⏰ Atgādinājums par spēli',
      greet: '👋 Sveiki!',
      intro: 'Atgādinām: jums ir pieteikums futbola spēlei. Informācija par spēli:',
      foot: 'Lūdzu, nekavējieties un neizlaidiet spēli! 🙌\nJa nevarat ierasties, atceliet pieteikumu lietotnē, lai vietu varētu ieņemt citi spēlētāji. Pretējā gadījumā jūsu profils var tikt bloķēts.',
    },
    label: { game: '⚽ Spēle', date: '📅 Datums', time: '🕗 Laiks', place: '📍 Vieta' },
    rules: '📋 Spēles noteikumi',
    open: '📋 Atvērt lietotni',
    map: '📍 Skatīt kartē',
  },
};

// Sana va soat (Riga vaqti bilan), tanlangan tilda
function whenParts(ts, lang) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ts));
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  const d = +p.day;
  const m = +p.month - 1;
  const dow = new Date(Date.UTC(+p.year, m, d)).getUTCDay();
  const day = DAYS[lang][dow];
  const mon = MONTHS[lang][m];
  const date =
    lang === 'en' ? `${day}, ${mon} ${d}` : lang === 'ru' ? `${day}, ${d} ${mon}` : lang === 'lv' ? `${day}, ${d}. ${mon}` : `${day}, ${d}-${mon}`;
  return { date, time: `${p.hour}:${p.minute}` };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Tayyor xabar: { text (HTML), reply_markup (tugmalar) }
// Eslatma (remind) batafsil: salomlashish, o'yin haqida ma'lumot (nomi, kun, soat, joy) va qoidalar (rules.js, bo'sh bo'lsa chiqmaydi)
function buildMessage(kind, g, lang, env, rules = GAME_RULES) {
  const L = MSG[lang] || MSG.uz;
  const lg = MSG[lang] ? lang : 'uz';
  const w = whenParts(g.ts, lg);
  const title = !g.title || g.title === DEFAULT_TITLE ? L.game : g.title;
  let lines;
  if (kind === 'remind') {
    const k = L.label;
    lines = [`<b>${esc(L.remind.head)}</b>`, '', `${esc(L.remind.greet)} ${esc(L.remind.intro)}`, '', `${k.game}: ${esc(title)}`, `${k.date}: ${esc(w.date)}`, `${k.time}: ${w.time}`];
    if (g.place) lines.push(`${k.place}: ${esc(g.place)}`);
    const r = String((rules && rules[lg]) || '').trim();
    if (r) lines.push('', `<b>${esc(L.rules)}</b>`, esc(r));
  } else {
    lines = [`<b>${esc(L[kind].head)}</b>`, '', `⚽ ${esc(title)}`, `📅 ${esc(w.date)}`, `🕗 ${w.time}`];
    if (g.place) lines.push(`📍 ${esc(g.place)}`);
  }
  lines.push('', esc(L[kind].foot));
  const buttons = [[{ text: L.open, web_app: { url: webAppUrl(env) } }]];
  if (g.map_url) buttons.push([{ text: L.map, url: g.map_url }]);
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: buttons } };
}

// Yuborish natijasi: 'ok' | 'dead' (odam botni bloklagan / chat yo'q: qayta urinmaymiz) | 'retry' (vaqtincha xato)
async function sendTo(env, chatId, msg) {
  try {
    const r = await tgCall(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', disable_web_page_preview: true, ...msg });
    if (r && r.ok) return 'ok';
    const code = r && r.error_code;
    if (code === 403 || code === 400) return 'dead';
    console.error('sendMessage', code, r && r.description);
    return 'retry';
  } catch (e) {
    console.error(e);
    return 'retry';
  }
}


// ---------- Moderatsiya xabarlari: ogohlantirish va blok ----------
// Muddat matni: nom = "1 hafta", for = "1 haftaga" (har tilda o'z shakli)
function duration(lang, days) {
  const w = days / 7;
  if (!Number.isInteger(w)) {
    return { uz: { nom: `${days} kun`, to: `${days} kunga` }, en: { nom: `${days} days`, to: `for ${days} days` }, ru: { nom: `${days} дн.`, to: `на ${days} дн.` }, lv: { nom: `${days} dienas`, to: `uz ${days} dienām` } }[lang];
  }
  const one = w % 10 === 1 && w % 100 !== 11;
  const few = w % 10 >= 2 && w % 10 <= 4 && (w % 100 < 12 || w % 100 > 14);
  if (lang === 'en') return { nom: `${w} week${w > 1 ? 's' : ''}`, to: `for ${w} week${w > 1 ? 's' : ''}` };
  if (lang === 'ru') return { nom: `${w} ${one ? 'неделя' : few ? 'недели' : 'недель'}`, to: `на ${w} ${one ? 'неделю' : few ? 'недели' : 'недель'}` };
  if (lang === 'lv') return { nom: `${w} ${one ? 'nedēļa' : 'nedēļas'}`, to: `uz ${w} ${one ? 'nedēļu' : 'nedēļām'}` };
  return { nom: `${w} hafta`, to: `${w} haftaga` };
}

const MOD = {
  uz: {
    warn: { head: '⚠️ Ogohlantirish', intro: "Siz quyidagi futbol o'yiniga kelmadingiz:", body: (d) => `Bu sizning oxirgi imkoniyatingiz. Agar yana o'yinga kelmasangiz, akkauntingiz ${d.to} bloklanadi va shu vaqt davomida ro'yxatdan o'ta olmaysiz.\n\nKela olmasangiz, oldindan ilovada ro'yxatdan chiqing: boshqa o'yinchilarga joy bo'shaydi.\nSavollar bo'lsa, admin bilan bog'laning.` },
    block: { head: '⛔ Akkauntingiz vaqtincha bloklandi', intro: (d) => `Siz futbol o'yinlariga ikki marta kelmadingiz, shuning uchun ro'yxatdan o'tishingiz ${d.to} cheklandi.`, len: (d) => `🔒 Blok muddati: ${d.nom}`, until: (dt) => `📅 Qayta ro'yxatdan o'ta olasiz: ${dt.date}, ${dt.time} dan keyin`, cancelled: "Shu davrdagi o'yinlarga yozuvlaringiz bekor qilindi.", foot: "Savol yoki e'tiroz bo'lsa, admin bilan bog'laning." },
  },
  en: {
    warn: { head: '⚠️ Warning', intro: 'You missed this football game:', body: (d) => `This is your last chance. If you miss another game, your account will be blocked ${d.to} and you won't be able to register during that time.\n\nIf you can't make it, cancel your registration in the app in advance so another player can take your spot.\nIf you have questions, contact the admin.` },
    block: { head: '⛔ Your account is temporarily blocked', intro: (d) => `You have missed two games, so registration is restricted ${d.to}.`, len: (d) => `🔒 Block length: ${d.nom}`, until: (dt) => `📅 You can register again after: ${dt.date}, ${dt.time}`, cancelled: 'Your registrations for games during this period were cancelled.', foot: 'If you have questions or objections, contact the admin.' },
  },
  ru: {
    warn: { head: '⚠️ Предупреждение', intro: 'Вы не пришли на футбольную игру:', body: (d) => `Это ваш последний шанс. Если вы снова не придёте на игру, ваш аккаунт будет заблокирован ${d.to}, и в это время вы не сможете записываться.\n\nЕсли не сможете прийти, заранее отмените запись в приложении, чтобы место досталось другому игроку.\nЕсли есть вопросы, свяжитесь с администратором.` },
    block: { head: '⛔ Ваш аккаунт временно заблокирован', intro: (d) => `Вы дважды не пришли на игры, поэтому запись ограничена ${d.to}.`, len: (d) => `🔒 Срок блокировки: ${d.nom}`, until: (dt) => `📅 Снова записаться можно после: ${dt.date}, ${dt.time}`, cancelled: 'Ваши записи на игры в этот период отменены.', foot: 'Если есть вопросы или возражения, свяжитесь с администратором.' },
  },
  lv: {
    warn: { head: '⚠️ Brīdinājums', intro: 'Jūs neieradāties uz šo futbola spēli:', body: (d) => `Šī ir jūsu pēdējā iespēja. Ja vēlreiz neieradīsieties uz spēli, jūsu profils tiks bloķēts ${d.to} un šajā laikā nevarēsiet pieteikties.\n\nJa nevarat ierasties, iepriekš atceliet pieteikumu lietotnē, lai vietu varētu ieņemt cits spēlētājs.\nJa ir jautājumi, sazinieties ar administratoru.` },
    block: { head: '⛔ Jūsu profils uz laiku bloķēts', intro: (d) => `Jūs divreiz neieradāties uz spēlēm, tāpēc pieteikšanās ir ierobežota ${d.to}.`, len: (d) => `🔒 Bloķēšanas ilgums: ${d.nom}`, until: (dt) => `📅 Atkal pieteikties varēsiet pēc: ${dt.date}, ${dt.time}`, cancelled: 'Jūsu pieteikumi spēlēm šajā periodā ir atcelti.', foot: 'Ja ir jautājumi vai iebildumi, sazinieties ar administratoru.' },
  },
};

// kind: 'warn' | 'block'. extra: { until, cancelled } (blok uchun)
function buildModeration(kind, g, lang, env, extra = {}) {
  const lg = MOD[lang] ? lang : 'uz';
  const L = MSG[lg];
  const M = MOD[lg][kind];
  const d = duration(lg, BLOCK_DAYS);
  const w = whenParts(g.ts, lg);
  const title = !g.title || g.title === DEFAULT_TITLE ? L.game : g.title;
  let lines;
  if (kind === 'warn') {
    lines = [`<b>${esc(M.head)}</b>`, '', esc(M.intro), '', `${L.label.game}: ${esc(title)}`, `${L.label.date}: ${esc(w.date)}`, `${L.label.time}: ${w.time}`, '', esc(M.body(d))];
  } else {
    const u = whenParts(extra.until, lg);
    lines = [`<b>${esc(M.head)}</b>`, '', esc(M.intro(d)), '', esc(M.len(d)), esc(M.until(u))];
    if (extra.cancelled) lines.push('', esc(M.cancelled));
    lines.push('', esc(M.foot));
  }
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: [[{ text: L.open, web_app: { url: webAppUrl(env) } }]] } };
}

// Moderatsiya xabarini yuborish (xato bo'lsa jim o'tadi; belgilash/blok bekor bo'lmaydi)
async function notifyModeration(env, kind, g, uid, lang, extra) {
  await sendTo(env, uid, buildModeration(kind, g, lang, env, extra));
}

// Ro'yxatdan o'tgandan keyin: tasdiq xabari (navbatda bo'lsa, boshqa matn)
async function notifyRegistered(env, g, uid, lang) {
  const regs = (await env.DB.prepare('SELECT * FROM registrations WHERE game_id = ? ORDER BY created_at, id').bind(g.id).all()).results;
  const row = seatRegs(regs, g.capacity).rows.find((x) => x.r.uid === uid);
  if (!row) return;
  await sendTo(env, uid, buildMessage(row.wait ? 'wait' : 'in', g, lang, env));
}

const markReminded = (env, ids, value) =>
  ids.length
    ? env.DB.prepare(`UPDATE registrations SET reminded = ? WHERE id IN (${ids.map(() => '?').join(',')})`).bind(value, ...ids).run()
    : null;

// Cron: o'yinigacha 24 soat yoki kamroq qolgan va hali eslatma olmagan odamlarga eslatma yuboradi.
// Navbatdagilarga (sig'masa) yubormaydi: ular ro'yxatga o'tgach, keyingi ishga tushishda oladi.
async function sendReminders(env, now = Date.now()) {
  await ensureSchema(env);
  const games = (
    await env.DB.prepare('SELECT * FROM games WHERE ts > ? AND ts <= ? ORDER BY ts').bind(now, now + REMIND_BEFORE_MS).all()
  ).results;
  const sent = [];
  const dead = [];
  let budget = REMIND_BATCH;
  for (const g of games) {
    if (budget <= 0) break;
    const regs = (await env.DB.prepare('SELECT * FROM registrations WHERE game_id = ? ORDER BY created_at, id').bind(g.id).all()).results;
    for (const { r, wait } of seatRegs(regs, g.capacity).rows) {
      if (wait || r.reminded || budget <= 0) continue;
      budget--;
      const res = await sendTo(env, r.uid, buildMessage('remind', g, MSG[r.lang] ? r.lang : 'uz', env));
      if (res === 'ok') sent.push(r.id);
      else if (res === 'dead') dead.push(r.id);
    }
  }
  await markReminded(env, sent, 1);
  await markReminded(env, dead, 2);
  return { sent: sent.length, dead: dead.length };
}

// ===== src/validate.js =====
/**
 * Telefon va email tekshirish.
 *   parsePhone / parseEmail : kiritilgan qiymat to'g'rimi (ro'yxatdan o'tishda)
 *   phoneKey / emailKey     : bir odamni topish uchun "kalit" (bloklashda: bir xil raqam yoki email = bir odam)
 */

// Telefon: faqat Latviya raqami: +371 va 8 ta raqam. To'g'ri bo'lsa "+371XXXXXXXX", bo'lmasa null.
function parsePhone(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\s().-]/g, '');
  const m = /^\+371(\d{8})$/.exec(s);
  return m ? '+371' + m[1] : null;
}

// Faqat raqamlar; 8 xonali bo'lsa 371 qo'shiladi. Eski yozuvlardagi turli yozilishlar ham bir xil chiqadi.
function phoneKey(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '371' + d;
  return d;
}

// Ko'p ishlatiladigan pochta domenlari: ularning xato yozilganini (gmail.con, gmial.com, icloud.co...) ushlaymiz
const POPULAR = ['gmail.com', 'icloud.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
// Haqiqiy domenlar (ular yuqoridagilarga o'xshash, lekin xato emas)
const REAL = new Set([
  ...POPULAR, 'googlemail.com', 'mail.com', 'email.com', 'me.com', 'mac.com', 'live.com', 'msn.com', 'ymail.com', 'aol.com',
  'gmx.com', 'gmx.de', 'gmx.net', 'yahoo.de', 'yahoo.fr', 'yahoo.it', 'yahoo.es', 'yahoo.co.uk', 'hotmail.co.uk', 'hotmail.de', 'hotmail.fr',
  'outlook.de', 'outlook.fr', 'outlook.lv', 'mail.ru', 'yandex.ru', 'yandex.com', 'ya.ru', 'inbox.lv', 'inbox.ru', 'list.ru', 'bk.ru',
  'tvnet.lv', 'apollo.lv', 'proton.me', 'protonmail.com', 'pm.me',
]);

function lev(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

// -> { ok: true, email } yoki { ok: false, suggest: 'gmail.com' | null }
function parseEmail(raw) {
  const email = String(raw == null ? '' : raw).trim().toLowerCase();
  if (email.length > 80 || email.includes('..') || !EMAIL_RE.test(email)) return { ok: false, suggest: null };
  const dom = email.slice(email.lastIndexOf('@') + 1);
  if (!REAL.has(dom)) {
    const near = POPULAR.find((p) => lev(dom, p) <= 2);
    if (near) return { ok: false, suggest: near };
  }
  return { ok: true, email };
}

// Bir odamning turli yozilgan emaillari bir xil kalit beradi: katta/kichik harf, "+yorliq", gmail nuqtalari
function emailKey(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1) return s;
  let local = s.slice(0, at).split('+')[0];
  let dom = s.slice(at + 1);
  if (dom === 'googlemail.com') dom = 'gmail.com';
  if (dom === 'gmail.com') local = local.replace(/\./g, '');
  return local + '@' + dom;
}

// ===== src/moderation.js =====
/**
 * Davomat va bloklash.
 *   - Admin o'tgan o'yinda yozuvni "keldi" yoki "kelmadi" deb belgilaydi.
 *   - Birinchi "kelmadi": ogohlantirish xabari (oxirgi imkoniyat).
 *   - Ikkinchi "kelmadi": avtomatik blok (BLOCK_DAYS kun), shu davrdagi o'yinlardagi yozuvlari bekor qilinadi.
 *   - Bir odam: Telegram ID, telefon yoki email bir xil bo'lsa (turli akkaunt ochib aylanib o'tib bo'lmaydi).
 *   - Admin belgini bekor qilsa ("clear" yoki "keldi"), kelmadi belgisi, ogohlantirish hisobi va u keltirgan blok ham olib tashlanadi.
 */







const DAY = 86400000;

// Yozuvdan odam kimligi: Telegram ID + telefon + email kalitlari
const identOf = (r) => ({ uid: r.uid, phone: phoneKey(r.phone), email: emailKey(r.email) });
// Ikki kimlik bir odammi (ID yoki telefon yoki email bir xil)
const sameIdent = (a, b) => a.uid === b.uid || (!!a.phone && a.phone === b.phone) || (!!a.email && a.email === b.email);

async function activeBlocks(env, now = Date.now()) {
  return (await env.DB.prepare('SELECT * FROM blocks WHERE until_ts > ? ORDER BY until_ts').bind(now).all()).results;
}
// Shu odam hozir bloklanganmi? -> blok yozuvi yoki null
async function findBlock(env, ident, now = Date.now()) {
  return (await activeBlocks(env, now)).find((b) => sameIdent(ident, identOf(b))) || null;
}
const activeStrikes = async (env) => (await env.DB.prepare('SELECT * FROM strikes WHERE block_id IS NULL').all()).results;

// Holat uchun: faol "kelmadi" lar va bloklar (state.js ishlatadi)
async function loadModeration(env, now = Date.now()) {
  return { strikes: await activeStrikes(env), blocks: await activeBlocks(env, now) };
}

const displayName = (r) => (r.kind === 'team' ? String((JSON.parse(r.members || '[]')[r.captain]) || r.name) : r.name);

// "Kelmadi" belgisi: hisobga qo'shadi; 1-sida ogohlantirish, STRIKES_TO_BLOCK-sida blok
async function addStrike(env, ctx, reg, game, now) {
  const ident = identOf(reg);
  await env.DB.prepare(
    'INSERT OR IGNORE INTO strikes (reg_id, game_id, uid, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(reg.id, reg.game_id, ident.uid, ident.phone, ident.email, now).run();

  const mine = (await activeStrikes(env)).filter((s) => sameIdent(ident, identOf(s)));
  const lang = reg.lang || 'uz';
  const send = (kind, extra) => {
    const task = notifyModeration(env, kind, game, reg.uid, lang, extra).catch((e) => console.error(e));
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
  };

  if (mine.length < STRIKES_TO_BLOCK) return send('warn');

  const until = now + BLOCK_DAYS * DAY;
  await env.DB.prepare(
    'INSERT INTO blocks (uid, name, phone, email, strike_reg_id, until_ts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(reg.uid, displayName(reg), ident.phone, ident.email, reg.id, until, now).run();
  const block = await env.DB.prepare('SELECT id FROM blocks WHERE strike_reg_id = ? ORDER BY id DESC').bind(reg.id).first();
  for (const s of mine) await env.DB.prepare('UPDATE strikes SET block_id = ? WHERE id = ?').bind(block.id, s.id).run();

  // Blok davridagi o'yinlarga qilingan yozuvlari bekor qilinadi
  const future = (
    await env.DB.prepare(
      'SELECT r.* FROM registrations r JOIN games g ON g.id = r.game_id WHERE g.ts > ? AND g.ts < ?'
    ).bind(now, until).all()
  ).results.filter((r) => sameIdent(ident, identOf(r)));
  for (const r of future) await env.DB.prepare('DELETE FROM registrations WHERE id = ?').bind(r.id).run();

  send('block', { until, cancelled: future.length });
}

// "Kelmadi" belgisini olib tashlaydi; u blok keltirgan bo'lsa, blok ham yo'qoladi (qolgan belgilar faol bo'lib qoladi)
async function removeStrike(env, regId) {
  const s = await env.DB.prepare('SELECT * FROM strikes WHERE reg_id = ?').bind(regId).first();
  if (!s) return;
  if (s.block_id) {
    await env.DB.prepare('DELETE FROM blocks WHERE id = ?').bind(s.block_id).run();
    await env.DB.prepare('UPDATE strikes SET block_id = NULL WHERE block_id = ?').bind(s.block_id).run();
  }
  await env.DB.prepare('DELETE FROM strikes WHERE id = ?').bind(s.id).run();
}

// POST /api/admin/attendance { id: yozuv ID, status: 'came' | 'absent' | 'clear' }
async function setAttendance(env, me, b, ctx) {
  needAdmin(me);
  const id = int(b.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Yozuv tanlanmagan');
  const next = b.status === 'absent' ? 0 : b.status === 'came' ? 1 : b.status === 'clear' ? null : undefined;
  if (next === undefined) throw new HttpError(400, "Noto'g'ri so'rov");
  const reg = await env.DB.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  if (!reg) throw new HttpError(404, 'Yozuv topilmadi');
  const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(reg.game_id).first();
  const now = Date.now();
  if (!game || game.ts > now) throw new HttpError(400, "O'yin hali boshlanmagan");
  const regs = (await env.DB.prepare('SELECT * FROM registrations WHERE game_id = ? ORDER BY created_at, id').bind(game.id).all()).results;
  const row = seatRegs(regs, game.capacity).rows.find((x) => x.r.id === id);
  if (row && row.wait) throw new HttpError(400, "Navbatdagi o'yinchi uchun belgilab bo'lmaydi");

  const prev = reg.attended == null ? null : reg.attended;
  if (prev === next) return;
  await env.DB.prepare('UPDATE registrations SET attended = ?, marked_at = ? WHERE id = ?').bind(next, next === null ? null : now, id).run();
  if (next === 0) await addStrike(env, ctx, reg, game, now);
  else if (prev === 0) await removeStrike(env, id);
}

// POST /api/admin/unblock { id: blok ID }: blok olib tashlanadi va shu blokka sabab bo'lgan belgilar tozalanadi
async function unblock(env, me, b) {
  needAdmin(me);
  const id = int(b.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Blok tanlanmagan');
  await env.DB.prepare('DELETE FROM strikes WHERE block_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM blocks WHERE id = ?').bind(id).run();
}

// ===== src/state.js =====
/**
 * Holatni yig'ish: GET /api/state va har bir amaldan keyin shu qaytariladi.
 *
 * Navbat (kutish ro'yxati): yozilganlar created_at tartibida sanaladi; sig'imga sig'magan
 * yozuv "waiting" bo'ladi. Bu har safar hisoblanadi, bazada saqlanmaydi.
 *
 * Maxfiylik:
 *   - admin: hamma narsa (ro'yxat, telefon, email, @username, sig'im, nechta yozilgan, davomat, "kelmadi" soni, bloklanganlar)
 *   - oddiy o'yinchi: faqat o'z yozuvi; sig'im / yozilganlar soni / navbat YUBORILMAYDI,
 *     faqat `fits` (yakka yoki jamoa sig'adimi) - ro'yxat formasidagi ogohlantirish uchun.
 */




async function buildState(env, me) {
  const isAdmin = isAdminRole(me);
  const since = Date.now() - HISTORY_DAYS * 86400000;
  const games = (
    await env.DB.prepare('SELECT * FROM games WHERE ts >= ? ORDER BY ts LIMIT 300').bind(since).all()
  ).results;
  const regs = (
    await env.DB.prepare(
      `SELECT r.* FROM registrations r JOIN games g ON g.id = r.game_id
       WHERE g.ts >= ? ORDER BY r.created_at, r.id`
    )
      .bind(since)
      .all()
  ).results;

  const mod = await loadModeration(env);   // faol "kelmadi" belgilari va bloklar
  const strikesOf = (r) => { const id = identOf(r); return mod.strikes.filter((x) => sameIdent(id, identOf(x))).length; };
  const blockOf = (r) => { const id = identOf(r); return mod.blocks.find((x) => sameIdent(id, identOf(x))) || null; };

  const byGame = new Map();
  for (const r of regs) {
    if (!byGame.has(r.game_id)) byGame.set(r.game_id, []);
    byGame.get(r.game_id).push(r);
  }

  const out = games.map((g) => {
    const { rows, used, waiting } = seatRegs(byGame.get(g.id) || [], g.capacity);
    const players = rows.map(({ r, members, wait }) => {
      const mine = !!me && r.uid === me.id;
      const p = { id: r.id, kind: r.kind, name: r.name, members, captain: r.captain, waiting: wait, mine };
      if (isAdmin || mine) {
        p.phone = r.phone;
        p.email = r.email;
      }
      if (isAdmin) {
        p.uid = r.uid;
        p.username = r.tg_username;
        p.attended = r.attended == null ? null : r.attended;   // null = belgilanmagan, 1 = keldi, 0 = kelmadi
        p.strikes = strikesOf(r);
        const bl = blockOf(r);
        if (bl) p.blockedUntil = bl.until_ts;
      }
      return p;
    });

    const free = Math.max(0, g.capacity - used);
    const game = {
      id: g.id,
      ts: g.ts,
      title: g.title,
      place: g.place,
      mapUrl: g.map_url,
      fits: { solo: free >= 1, team: free >= TEAM_SIZE },
      players: isAdmin ? players : players.filter((p) => p.mine),
    };
    if (isAdmin) Object.assign(game, { capacity: g.capacity, used, waiting });
    return game;
  });

  // O'yinchiga faqat o'zining bloki ko'rinadi (ilovada "bloklangansiz" xabari uchun)
  const myBlock = me ? mod.blocks.find((x) => x.uid === me.id) : null;
  const state = { me: me ? { ...me, blockedUntil: myBlock ? myBlock.until_ts : 0 } : null, games: out, serverTime: Date.now() };
  if (isAdmin) state.blocks = mod.blocks.map((x) => ({ id: x.id, name: x.name, uid: x.uid, phone: x.phone, email: x.email, until: x.until_ts }));
  if (me && me.role === 'owner') {
    state.admins = (await env.DB.prepare('SELECT uid, name, created_at FROM admins ORDER BY created_at').all()).results;
  }
  return state;
}

// ===== src/routes/player.js =====
/** Futbolchi amallari: o'yinga yozilish va chiqish. */







async function register(env, me, b, ctx) {
  needLogin(me);
  const gameId = int(b.gameId);
  if (!Number.isInteger(gameId)) throw new HttpError(400, "O'yin tanlanmagan");
  const g = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first();
  if (!g) throw new HttpError(404, "O'yin topilmadi");
  if (g.ts <= Date.now()) throw new HttpError(400, "Bu o'yin allaqachon o'tgan");

  const kind = b.kind === 'team' ? 'team' : b.kind === 'solo' ? 'solo' : null;
  if (!kind) throw new HttpError(400, 'Avval tanlang: jamoa yoki yakka');

  // Telefon: faqat Latviya raqami (+371 va 8 ta raqam); "+371XXXXXXXX" ko'rinishida saqlanadi
  const phone = parsePhone(str(b.phone, 30));
  if (!phone) throw new HttpError(400, "Telefon raqam +371 bilan boshlanib, 8 ta raqamdan iborat bo'lsin");

  let name;
  let members = [];
  let captain = 0;
  let email = '';
  if (kind === 'solo') {
    name = str(b.name, 40);
    if (name.length < 2) throw new HttpError(400, 'Ismingizni kiriting');
    const em = parseEmail(str(b.email, 80));
    if (!em.ok) throw new HttpError(400, em.suggest ? `Email domeni xato yozilgan: ${em.suggest}` : "Email manzilni to'g'ri kiriting");
    email = em.email;
  } else {
    members = Array.isArray(b.members) ? b.members.map((s) => str(s, 40)) : [];
    if (members.length !== TEAM_SIZE || members.some((s) => s.length < 2)) {
      throw new HttpError(400, `${TEAM_SIZE} ta o'yinchining hammasini kiriting`);
    }
    captain = int(b.captain);
    if (!Number.isInteger(captain) || captain < 0 || captain >= TEAM_SIZE) {
      throw new HttpError(400, 'Kapitanni belgilang');
    }
    name = str(b.teamName, 40) || 'Jamoa';
  }

  // Bloklangan odam (Telegram ID, telefon yoki email bo'yicha) ro'yxatdan o'ta olmaydi
  const blocked = await findBlock(env, { uid: me.id, phone: phoneKey(phone), email: emailKey(email) });
  if (blocked) throw new HttpError(403, 'Siz vaqtincha bloklangansiz', { until: blocked.until_ts });

  // Til: mijoz yuborgan (ilovada tanlangan), bo'lmasa Telegram tili. Keyingi xabarlar shu tilda ketadi.
  const lang = pickLang(b.lang, me.tgLang);
  // O'yinga 24 soatdan kam qolgan bo'lsa, tasdiq xabarining o'zi yetarli: eslatma alohida yuborilmaydi
  const reminded = g.ts - Date.now() <= REMIND_BEFORE_MS ? 1 : 0;

  try {
    await env.DB.prepare(
      `INSERT INTO registrations
         (game_id, uid, tg_username, kind, name, members, captain, phone, email, created_at, lang, reminded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(g.id, me.id, me.username, kind, name, JSON.stringify(members), captain, phone, email, Date.now(), lang, reminded)
      .run();
  } catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e))) {
      throw new HttpError(409, "Siz bu o'yinga allaqachon yozilgansiz");
    }
    throw e;
  }

  // Tasdiq xabari botdan chatga yuboriladi. Javobni kutdirmaymiz; xato bo'lsa ro'yxatdan o'tish bekor bo'lmaydi.
  const task = notifyRegistered(env, g, me.id, lang).catch((e) => console.error(e));
  if (ctx && ctx.waitUntil) ctx.waitUntil(task);
}

async function cancel(env, me, b) {
  needLogin(me);
  const gameId = int(b.gameId);
  if (!Number.isInteger(gameId)) throw new HttpError(400, "O'yin tanlanmagan");
  const g = await env.DB.prepare('SELECT ts FROM games WHERE id = ?').bind(gameId).first();
  if (!g) throw new HttpError(404, "O'yin topilmadi");
  if (g.ts <= Date.now()) throw new HttpError(400, "O'yin boshlangan, bekor qilib bo'lmaydi");
  await env.DB.prepare('DELETE FROM registrations WHERE game_id = ? AND uid = ?').bind(gameId, me.id).run();
}

// ===== src/routes/games.js =====
/** Admin amallari: o'yinlar va yozuvlar. */





async function saveGame(env, me, b) {
  needAdmin(me);
  const ts = int(b.ts);
  if (!(ts > 946684800000 && ts < 4102444800000)) throw new HttpError(400, "Sana yoki vaqt noto'g'ri");
  const capacity = int(b.capacity);
  if (!(capacity >= 1 && capacity <= 200)) throw new HttpError(400, "O'rinlar soni 1 dan 200 gacha bo'lsin");
  const title = str(b.title, 60) || DEFAULT_TITLE;
  const place = str(b.place, 120);
  const mapUrl = str(b.mapUrl, 300);
  if (mapUrl && !/^https?:\/\/\S+$/i.test(mapUrl)) {
    throw new HttpError(400, "Xarita havolasi http:// yoki https:// bilan boshlansin");
  }

  if (b.id != null && b.id !== '') {
    // tahrirlash
    const id = int(b.id);
    if (!Number.isInteger(id)) throw new HttpError(400, "O'yin tanlanmagan");
    const old = await env.DB.prepare('SELECT ts FROM games WHERE id = ?').bind(id).first();
    const r = await env.DB.prepare(
      'UPDATE games SET ts = ?, title = ?, place = ?, map_url = ?, capacity = ? WHERE id = ?'
    )
      .bind(ts, title, place, mapUrl, capacity, id)
      .run();
    if (!r.meta || !r.meta.changes) throw new HttpError(404, "O'yin topilmadi");
    // O'yin vaqti o'zgarsa, eslatma yangi vaqtga qarab qayta yuboriladi
    if (old && old.ts !== ts) await env.DB.prepare('UPDATE registrations SET reminded = 0 WHERE game_id = ?').bind(id).run();
  } else {
    // yangi o'yin
    await env.DB.prepare(
      'INSERT INTO games (ts, title, place, map_url, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(ts, title, place, mapUrl, capacity, Date.now())
      .run();
  }
}

async function deleteGame(env, me, b) {
  needAdmin(me);
  const id = int(b.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "O'yin tanlanmagan");
  // O'yin o'chirilsa, undagi "kelmadi" belgilari ham hisobdan chiqadi
  for (const r of (await env.DB.prepare('SELECT id FROM registrations WHERE game_id = ?').bind(id).all()).results) await removeStrike(env, r.id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM registrations WHERE game_id = ?').bind(id),
    env.DB.prepare('DELETE FROM games WHERE id = ?').bind(id),
  ]);
}

async function deleteReg(env, me, b) {
  needAdmin(me);
  const id = int(b.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Yozuv tanlanmagan');
  await removeStrike(env, id);   // "kelmadi" belgisi bo'lsa, u ham olib tashlanadi
  await env.DB.prepare('DELETE FROM registrations WHERE id = ?').bind(id).run();
}

// ===== src/routes/admins.js =====
/** Asoschi amallari: adminlarni qo'shish va o'chirish. */



async function addAdmin(env, me, b) {
  needOwner(me);
  const uid = int(b.uid);
  if (!Number.isInteger(uid) || uid <= 0) throw new HttpError(400, "Telegram ID faqat raqamlardan iborat bo'lsin");
  if (parseIds(env.OWNER_IDS).includes(uid)) throw new HttpError(400, "Bu ID asoschiga tegishli, qo'shish shart emas");
  const name = str(b.name, 60);
  await env.DB.prepare(
    `INSERT INTO admins (uid, name, added_by, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(uid) DO UPDATE SET name = excluded.name`
  )
    .bind(uid, name, me.id, Date.now())
    .run();
}

async function removeAdmin(env, me, b) {
  needOwner(me);
  const uid = int(b.uid);
  if (!Number.isInteger(uid)) throw new HttpError(400, 'Admin tanlanmagan');
  await env.DB.prepare('DELETE FROM admins WHERE uid = ?').bind(uid).run();
}

// ===== src/routes/index.js =====
/** Marshrutlar jadvali: manzil -> funksiya. Yangi amal qo'shish uchun shu yerga bitta qator qo'shiladi. */




const ROUTES = {
  '/api/register': register,
  '/api/cancel': cancel,
  '/api/admin/game': saveGame,
  '/api/admin/game/delete': deleteGame,
  '/api/admin/reg/delete': deleteReg,
  '/api/admin/attendance': setAttendance,
  '/api/admin/unblock': unblock,
  '/api/admin/admins/add': addAdmin,
  '/api/admin/admins/remove': removeAdmin,
};

// ===== src/index.js =====
/**
 * Riga Street Power Liga: API serveri (Cloudflare Worker + D1).
 * Kirish nuqtasi: so'rov shu yerga keladi va kerakli bo'limga yo'naltiriladi.
 *
 * Cloudflare'da kerakli sozlamalar:
 *   DB              D1 baza (binding nomi aynan "DB")
 *   BOT_TOKEN       BotFather bergan token (Secret sifatida)
 *   OWNER_IDS       asoschi(lar) Telegram ID si, vergul bilan: 5310968084
 *   ALLOWED_ORIGIN  Mini App joylashgan sayt: https://bilol-pm.github.io
 *   WEBHOOK_SECRET  /start javobi (Telegram webhook) uchun maxfiy so'z, Secret sifatida
 *   WEBAPP_URL      ixtiyoriy: Mini App manzili (berilmasa config.js dagi ishlatiladi)
 *   Cron Trigger    har 5 daqiqada ishlaydi (README'ga qarang): o'yinga 24 soat qolganda eslatma yuboradi
 */







export default {
  async fetch(req, env, ctx) {
    const ch = corsHeaders(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      // Telegram bot: /start javobi (baza va Mini App imzosi kerak emas)
      if (path.startsWith('/telegram/')) return await handleTelegram(req, env, path, ch);

      // Tekshiruv sahifasi: brauzerda ochsangiz "ready": true chiqishi kerak
      if (path === '/' && req.method === 'GET') {
        return json({ ok: true, service: 'riga-sp-league-api', ready: !!(env.DB && env.BOT_TOKEN), webhook: !!env.WEBHOOK_SECRET }, 200, ch);
      }
      if (!env.DB) throw new HttpError(500, 'Baza (DB) ulanmagan');
      if (!env.BOT_TOKEN) throw new HttpError(500, 'BOT_TOKEN sozlanmagan');
      await ensureSchema(env);

      const me = await getMe(req, env);

      if (path === '/api/state' && req.method === 'GET') {
        return json({ ok: true, state: await buildState(env, me) }, 200, ch);
      }

      const handler = ROUTES[path];
      if (!handler || req.method !== 'POST') throw new HttpError(404, 'Topilmadi');
      await handler(env, me, await readBody(req), ctx);
      return json({ ok: true, state: await buildState(env, me) }, 200, ch);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message, ...(e.data || {}) }, e.status, ch);
      console.error(e);
      return json({ ok: false, error: "Server xatosi. Birozdan keyin urinib ko'ring." }, 500, ch);
    }
  },

  // Cloudflare Cron Trigger shu yerga keladi (Settings -> Triggers -> Cron Triggers)
  async scheduled(event, env, ctx) {
    if (!env.DB || !env.BOT_TOKEN) return;
    ctx.waitUntil(sendReminders(env).catch((e) => console.error(e)));
  },
};
