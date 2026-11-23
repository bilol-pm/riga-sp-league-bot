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
import { HISTORY_DAYS, TEAM_SIZE } from './config.js';
import { isAdminRole } from './auth.js';
import { safeJson } from './utils.js';

export async function buildState(env, me) {
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
