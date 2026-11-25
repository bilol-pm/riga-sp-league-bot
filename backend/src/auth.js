/**
 * Kimligini aniqlash va rollar.
 *   1) Telegram Mini App har so'rovda X-Init-Data yuboradi; uni BOT_TOKEN bilan HMAC orqali tekshiramiz.
 *   2) Rol: owner (OWNER_IDS), admin (admins jadvali) yoki player.
 */
import { MAX_AUTH_AGE } from './config.js';
import { HttpError } from './http.js';
import { parseIds, safeEqual, safeJson, str } from './utils.js';

export async function verifyInitData(initData, botToken) {
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
export async function getMe(req, env) {
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

export const isAdminRole = (me) => !!me && (me.role === 'owner' || me.role === 'admin');

export const needLogin = (me) => {
  if (!me) throw new HttpError(401, "Telegram ichida oching, shunda ro'yxatdan o'tish mumkin.");
};
export const needAdmin = (me) => {
  needLogin(me);
  if (!isAdminRole(me)) throw new HttpError(403, 'Bu amal faqat adminlar uchun.');
};
export const needOwner = (me) => {
  needLogin(me);
  if (me.role !== 'owner') throw new HttpError(403, "Bu amal faqat asoschi uchun.");
};
