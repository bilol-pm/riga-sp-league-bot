/**
 * Ma'lumotlar bazasi (Cloudflare D1 = SQLite).
 * Jadvallar birinchi so'rovda o'zi yaratiladi (CREATE TABLE IF NOT EXISTS),
 * shuning uchun qo'lda SQL yozish shart emas.
 *
 *   games          o'yinlar (sana, joy, sig'im)
 *   registrations  ro'yxatdan o'tishlar (yakka yoki jamoa)
 *   admins         adminlar (asoschi bu jadvalda emas, u OWNER_IDS da)
 *
 * Eski bazaga yangi ustunlar (lang, reminded) ham o'zi qo'shiladi (migrate).
 */
// Har bir baza uchun jadvallar bir marta tekshiriladi (sinovda bir nechta baza bo'lishi mumkin)
const schemaDone = new WeakMap();

export function ensureSchema(env) {
  const db = env.DB;
  let schemaPromise = schemaDone.get(db);
  if (!schemaPromise) {
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
      .then(() => migrate(env))
      .catch((e) => {
        schemaDone.delete(db);
        throw e;
      });
    schemaDone.set(db, schemaPromise);
  }
  return schemaPromise;
}

// Eski bazada yo'q ustunlarni qo'shadi (CREATE TABLE IF NOT EXISTS mavjud jadvalni o'zgartirmaydi)
//   lang      yozilgan odamning tili (uz / en / ru / lv): xabar shu tilda ketadi
//   reminded  eslatma holati: 0 = hali yuborilmagan, 1 = yuborildi, 2 = yuborib bo'lmadi (bot bloklangan)
async function migrate(env) {
  const cols = (await env.DB.prepare('PRAGMA table_info(registrations)').all()).results.map((c) => c.name);
  const add = [];
  if (!cols.includes('lang')) add.push("ALTER TABLE registrations ADD COLUMN lang TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('reminded')) add.push('ALTER TABLE registrations ADD COLUMN reminded INTEGER NOT NULL DEFAULT 0');
  for (const sql of add) {
    try {
      await env.DB.prepare(sql).run();
    } catch (e) {
      if (!/duplicate column/i.test(String((e && e.message) || e))) throw e;   // boshqa nusxa allaqachon qo'shgan
    }
  }
}
