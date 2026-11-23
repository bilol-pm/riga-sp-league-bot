/** Asoschi amallari: adminlarni qo'shish va o'chirish. */
import { HttpError } from '../http.js';
import { needOwner } from '../auth.js';
import { int, parseIds, str } from '../utils.js';

export async function addAdmin(env, me, b) {
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

export async function removeAdmin(env, me, b) {
  needOwner(me);
  const uid = int(b.uid);
  if (!Number.isInteger(uid)) throw new HttpError(400, 'Admin tanlanmagan');
  await env.DB.prepare('DELETE FROM admins WHERE uid = ?').bind(uid).run();
}
