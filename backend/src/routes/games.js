/** Admin amallari: o'yinlar va yozuvlar. */
import { DEFAULT_TITLE } from '../config.js';
import { HttpError } from '../http.js';
import { needAdmin } from '../auth.js';
import { int, str } from '../utils.js';

export async function saveGame(env, me, b) {
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

export async function deleteGame(env, me, b) {
  needAdmin(me);
  const id = int(b.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "O'yin tanlanmagan");
  await env.DB.batch([
    env.DB.prepare('DELETE FROM registrations WHERE game_id = ?').bind(id),
    env.DB.prepare('DELETE FROM games WHERE id = ?').bind(id),
  ]);
}

export async function deleteReg(env, me, b) {
  needAdmin(me);
  const id = int(b.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Yozuv tanlanmagan');
  await env.DB.prepare('DELETE FROM registrations WHERE id = ?').bind(id).run();
}
