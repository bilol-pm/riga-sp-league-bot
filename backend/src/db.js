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

export function ensureSchema(env) {
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
