/**
 * Riga Street Power Liga: API serveri
 * Cloudflare Worker + D1 (SQLite) bazasi.
 *
 * Cloudflare'da kerakli sozlamalar:
 *   DB              D1 baza (binding nomi aynan "DB")
 *   BOT_TOKEN       BotFather bergan token (Secret sifatida)
 *   OWNER_IDS       asoschi(lar) Telegram ID si, vergul bilan: 5310968084
 *   ALLOWED_ORIGIN  Mini App joylashgan sayt: https://bilol-pm.github.io
 *
 * Jadvallar birinchi so'rovda o'zi yaratiladi, qo'lda SQL yozish shart emas.
 */

const TEAM_SIZE = 7;
const MAX_AUTH_AGE = 3 * 24 * 3600; // Telegram imzosi necha soniya amal qiladi

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ---------- Kichik yordamchilar ---------- */
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
const str = (v, max) => clean(v).slice(0, max);
const int = (v) =>
  (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v)
    ? Math.trunc(+v)
    : NaN;
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
const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

/* ---------- Baza ---------- */
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

/* ---------- Telegram imzosini tekshirish ---------- */
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

async function getMe(req, env) {
  const raw = req.headers.get('X-Init-Data');
  if (!raw) return null; // Telegramsiz (oddiy brauzer): faqat ommaviy ma'lumot
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

const needLogin = (me) => {
  if (!me) throw new HttpError(401, "Telegram ichida oching, shunda ro'yxatdan o'tish mumkin.");
};
const needAdmin = (me) => {
  needLogin(me);
  if (me.role !== 'owner' && me.role !== 'admin') throw new HttpError(403, 'Bu amal faqat adminlar uchun.');
};
const needOwner = (me) => {
  needLogin(me);
  if (me.role !== 'owner') throw new HttpError(403, "Bu amal faqat asoschi uchun.");
};

/* ---------- Holatni yig'ish ---------- */
async function buildState(env, me) {
  const isAdmin = !!me && (me.role === 'owner' || me.role === 'admin');
  const since = Date.now() - 8 * 86400000;
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
    return {
      id: g.id,
      ts: g.ts,
      title: g.title,
      place: g.place,
      mapUrl: g.map_url,
      capacity: g.capacity,
      used,
      waiting,
      players,
    };
  });

  const state = { me, games: out, serverTime: Date.now() };
  if (me && me.role === 'owner') {
    state.admins = (await env.DB.prepare('SELECT uid, name, created_at FROM admins ORDER BY created_at').all()).results;
  }
  return state;
}

/* ---------- Futbolchi amallari ---------- */
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

/* ---------- Admin amallari ---------- */
async function saveGame(env, me, b) {
  needAdmin(me);
  const ts = int(b.ts);
  if (!(ts > 946684800000 && ts < 4102444800000)) throw new HttpError(400, "Sana yoki vaqt noto'g'ri");
  const capacity = int(b.capacity);
  if (!(capacity >= 1 && capacity <= 200)) throw new HttpError(400, "O'rinlar soni 1 dan 200 gacha bo'lsin");
  const title = str(b.title, 60) || "Futbol o'yini";
  const place = str(b.place, 120);
  const mapUrl = str(b.mapUrl, 300);
  if (mapUrl && !/^https?:\/\/\S+$/i.test(mapUrl)) {
    throw new HttpError(400, "Xarita havolasi http:// yoki https:// bilan boshlansin");
  }

  if (b.id != null && b.id !== '') {
    const id = int(b.id);
    if (!Number.isInteger(id)) throw new HttpError(400, "O'yin tanlanmagan");
    const r = await env.DB.prepare(
      'UPDATE games SET ts = ?, title = ?, place = ?, map_url = ?, capacity = ? WHERE id = ?'
    )
      .bind(ts, title, place, mapUrl, capacity, id)
      .run();
    if (!r.meta || !r.meta.changes) throw new HttpError(404, "O'yin topilmadi");
  } else {
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

async function addAdmin(env, me, b) {
  needOwner(me);
  const uid = int(b.uid);
  if (!Number.isInteger(uid) || uid <= 0) throw new HttpError(400, "Telegram ID faqat raqamlardan iborat bo'lsin");
  if (parseIds(env.OWNER_IDS).includes(uid)) throw new HttpError(400, 'Bu ID asoschiga tegishli, qo\'shish shart emas');
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

const ROUTES = {
  '/api/register': register,
  '/api/cancel': cancel,
  '/api/admin/game': saveGame,
  '/api/admin/game/delete': deleteGame,
  '/api/admin/reg/delete': deleteReg,
  '/api/admin/admins/add': addAdmin,
  '/api/admin/admins/remove': removeAdmin,
};

/* ---------- HTTP ---------- */
function corsHeaders(env, req) {
  const allowed = String(env.ALLOWED_ORIGIN || 'https://bilol-pm.github.io')
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
  if (len > 20000) throw new HttpError(413, "So'rov juda katta");
  let b;
  try {
    b = await req.json();
  } catch (e) {
    throw new HttpError(400, "Noto'g'ri so'rov");
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, "Noto'g'ri so'rov");
  return b;
}

export default {
  async fetch(req, env) {
    const ch = corsHeaders(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path === '/' && req.method === 'GET') {
        return json({ ok: true, service: 'riga-sp-league-api', ready: !!(env.DB && env.BOT_TOKEN) }, 200, ch);
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
      return json({ ok: false, error: 'Server xatosi. Birozdan keyin urinib ko\'ring.' }, 500, ch);
    }
  },
};
