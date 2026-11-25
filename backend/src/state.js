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
import { HISTORY_DAYS, TEAM_SIZE } from './config.js';
import { isAdminRole } from './auth.js';
import { identOf, loadModeration, sameIdent } from './moderation.js';
import { seatRegs } from './queue.js';

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
