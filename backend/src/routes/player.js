/** Futbolchi amallari: o'yinga yozilish va chiqish. */
import { REMIND_BEFORE_MS, TEAM_SIZE } from '../config.js';
import { HttpError } from '../http.js';
import { needLogin } from '../auth.js';
import { notifyRegistered, pickLang } from '../notify.js';
import { int, str } from '../utils.js';

export async function register(env, me, b, ctx) {
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

export async function cancel(env, me, b) {
  needLogin(me);
  const gameId = int(b.gameId);
  if (!Number.isInteger(gameId)) throw new HttpError(400, "O'yin tanlanmagan");
  const g = await env.DB.prepare('SELECT ts FROM games WHERE id = ?').bind(gameId).first();
  if (!g) throw new HttpError(404, "O'yin topilmadi");
  if (g.ts <= Date.now()) throw new HttpError(400, "O'yin boshlangan, bekor qilib bo'lmaydi");
  await env.DB.prepare('DELETE FROM registrations WHERE game_id = ? AND uid = ?').bind(gameId, me.id).run();
}
