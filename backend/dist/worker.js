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

// ===== src/http.js =====
/** HTTP qatlami: xato sinfi, JSON javob, CORS, so'rov tanasini o'qish. */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
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
 */
let schemaPromise = null;

function ensureSchema(env) {
  if (!schemaPromise) {
    const db = env.DB;
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
        db.prepare('CREATE INDEX IF NOT EXISTS idx_games_ts ON games (ts)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_reg_game ON registrations (game_id)'),
      ])
      .catch((e) => {
        schemaPromise = null;
        throw e;
      });
  }
  return schemaPromise;
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

// ===== src/state.js =====
/**
 * Holatni yig'ish: GET /api/state va har bir amaldan keyin shu qaytariladi.
 *
 * Navbat (kutish ro'yxati): yozilganlar created_at tartibida sanaladi; sig'imga sig'magan
 * yozuv "waiting" bo'ladi. Bu har safar hisoblanadi, bazada saqlanmaydi.
 *
 * Maxfiylik:
 *   - admin: hamma narsa (ro'yxat, telefon, email, @username, sig'im, nechta yozilgan)
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

  const byGame = new Map();
  for (const r of regs) {
    if (!byGame.has(r.game_id)) byGame.set(r.game_id, []);
    byGame.get(r.game_id).push(r);
  }

  const out = games.map((g) => {
    let used = 0;
    let waiting = 0;
    const players = (byGame.get(g.id) || []).map((r) => {
      const members = safeJson(r.members, []);
      const size = r.kind === 'team' ? members.length : 1;
      let wait = false;
      if (used + size <= g.capacity) used += size;
      else {
        wait = true;
        waiting += size;
      }
      const mine = !!me && r.uid === me.id;
      const p = { id: r.id, kind: r.kind, name: r.name, members, captain: r.captain, waiting: wait, mine };
      if (isAdmin || mine) {
        p.phone = r.phone;
        p.email = r.email;
      }
      if (isAdmin) {
        p.uid = r.uid;
        p.username = r.tg_username;
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

  const state = { me, games: out, serverTime: Date.now() };
  if (me && me.role === 'owner') {
    state.admins = (await env.DB.prepare('SELECT uid, name, created_at FROM admins ORDER BY created_at').all()).results;
  }
  return state;
}

// ===== src/routes/player.js =====
/** Futbolchi amallari: o'yinga yozilish va chiqish. */




async function register(env, me, b) {
  needLogin(me);
  const gameId = int(b.gameId);
  if (!Number.isInteger(gameId)) throw new HttpError(400, "O'yin tanlanmagan");
  const g = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first();
  if (!g) throw new HttpError(404, "O'yin topilmadi");
  if (g.ts <= Date.now()) throw new HttpError(400, "Bu o'yin allaqachon o'tgan");

  const kind = b.kind === 'team' ? 'team' : b.kind === 'solo' ? 'solo' : null;
  if (!kind) throw new HttpError(400, 'Avval tanlang: jamoa yoki yakka');

  const phone = str(b.phone, 30);
  if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) throw new HttpError(400, "Telefon raqamni to'g'ri kiriting");

  let name;
  let members = [];
  let captain = 0;
  let email = '';
  if (kind === 'solo') {
    name = str(b.name, 40);
    if (name.length < 2) throw new HttpError(400, 'Ismingizni kiriting');
    email = str(b.email, 80);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Email manzilni to'g'ri kiriting");
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

  try {
    await env.DB.prepare(
      `INSERT INTO registrations
         (game_id, uid, tg_username, kind, name, members, captain, phone, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(g.id, me.id, me.username, kind, name, JSON.stringify(members), captain, phone, email, Date.now())
      .run();
  } catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e))) {
      throw new HttpError(409, "Siz bu o'yinga allaqachon yozilgansiz");
    }
    throw e;
  }
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
    const r = await env.DB.prepare(
      'UPDATE games SET ts = ?, title = ?, place = ?, map_url = ?, capacity = ? WHERE id = ?'
    )
      .bind(ts, title, place, mapUrl, capacity, id)
      .run();
    if (!r.meta || !r.meta.changes) throw new HttpError(404, "O'yin topilmadi");
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
  await env.DB.batch([
    env.DB.prepare('DELETE FROM registrations WHERE game_id = ?').bind(id),
    env.DB.prepare('DELETE FROM games WHERE id = ?').bind(id),
  ]);
}

async function deleteReg(env, me, b) {
  needAdmin(me);
  const id = int(b.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Yozuv tanlanmagan');
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
  '/api/admin/admins/add': addAdmin,
  '/api/admin/admins/remove': removeAdmin,
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
 */






export default {
  async fetch(req, env) {
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
      await handler(env, me, await readBody(req));
      return json({ ok: true, state: await buildState(env, me) }, 200, ch);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status, ch);
      console.error(e);
      return json({ ok: false, error: "Server xatosi. Birozdan keyin urinib ko'ring." }, 500, ch);
    }
  },
};
