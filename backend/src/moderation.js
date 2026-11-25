/**
 * Davomat va bloklash.
 *   - Admin o'tgan o'yinda yozuvni "keldi" yoki "kelmadi" deb belgilaydi.
 *   - Birinchi "kelmadi": ogohlantirish xabari (oxirgi imkoniyat).
 *   - Ikkinchi "kelmadi": avtomatik blok (BLOCK_DAYS kun), shu davrdagi o'yinlardagi yozuvlari bekor qilinadi.
 *   - Bir odam: Telegram ID, telefon yoki email bir xil bo'lsa (turli akkaunt ochib aylanib o'tib bo'lmaydi).
 *   - Admin belgini bekor qilsa ("clear" yoki "keldi"), kelmadi belgisi, ogohlantirish hisobi va u keltirgan blok ham olib tashlanadi.
 */
import { BLOCK_DAYS, STRIKES_TO_BLOCK } from './config.js';
import { HttpError } from './http.js';
import { needAdmin } from './auth.js';
import { notifyModeration } from './notify.js';
import { seatRegs } from './queue.js';
import { int } from './utils.js';
import { emailKey, phoneKey } from './validate.js';

const DAY = 86400000;

// Yozuvdan odam kimligi: Telegram ID + telefon + email kalitlari
export const identOf = (r) => ({ uid: r.uid, phone: phoneKey(r.phone), email: emailKey(r.email) });
// Ikki kimlik bir odammi (ID yoki telefon yoki email bir xil)
export const sameIdent = (a, b) => a.uid === b.uid || (!!a.phone && a.phone === b.phone) || (!!a.email && a.email === b.email);

export async function activeBlocks(env, now = Date.now()) {
  return (await env.DB.prepare('SELECT * FROM blocks WHERE until_ts > ? ORDER BY until_ts').bind(now).all()).results;
}
// Shu odam hozir bloklanganmi? -> blok yozuvi yoki null
export async function findBlock(env, ident, now = Date.now()) {
  return (await activeBlocks(env, now)).find((b) => sameIdent(ident, identOf(b))) || null;
}
const activeStrikes = async (env) => (await env.DB.prepare('SELECT * FROM strikes WHERE block_id IS NULL').all()).results;

// Holat uchun: faol "kelmadi" lar va bloklar (state.js ishlatadi)
export async function loadModeration(env, now = Date.now()) {
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
export async function removeStrike(env, regId) {
  const s = await env.DB.prepare('SELECT * FROM strikes WHERE reg_id = ?').bind(regId).first();
  if (!s) return;
  if (s.block_id) {
    await env.DB.prepare('DELETE FROM blocks WHERE id = ?').bind(s.block_id).run();
    await env.DB.prepare('UPDATE strikes SET block_id = NULL WHERE block_id = ?').bind(s.block_id).run();
  }
  await env.DB.prepare('DELETE FROM strikes WHERE id = ?').bind(s.id).run();
}

// POST /api/admin/attendance { id: yozuv ID, status: 'came' | 'absent' | 'clear' }
export async function setAttendance(env, me, b, ctx) {
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
export async function unblock(env, me, b) {
  needAdmin(me);
  const id = int(b.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Blok tanlanmagan');
  await env.DB.prepare('DELETE FROM strikes WHERE block_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM blocks WHERE id = ?').bind(id).run();
}
