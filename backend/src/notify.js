/**
 * O'yinchiga Telegram bot orqali xabar yuborish (bot bilan chatiga):
 *   1) Ro'yxatdan o'tishi bilan: "siz mana shu sana va vaqtga yozildingiz" (tasdiq xabari)
 *   2) O'yindan roppa-rosa 24 soat oldin: "siz futbolga yozilgansiz, kechikmasdan keling" (eslatma)
 *
 * Eslatmani Cloudflare Cron Trigger ishga tushiradi (index.js dagi `scheduled`), har 5 daqiqada.
 * Xabar odam yozilganda tanlagan tilida ketadi (uz / en / ru / lv).
 * Matnlarni o'zgartirish: pastdagi MSG jadvalida.
 *
 * Yana ikki xabar (moderatsiya): birinchi "kelmadi"da OGOHLANTIRISH, ikkinchisida BLOK xabari (MOD jadvali).
 */
import { BLOCK_DAYS, DEFAULT_TITLE, REMIND_BATCH, REMIND_BEFORE_MS, TIMEZONE } from './config.js';
import { ensureSchema } from './db.js';
import { seatRegs } from './queue.js';
import { GAME_RULES } from './rules.js';
import { tgCall, webAppUrl } from './telegram.js';

const LANG_CODES = ['uz', 'en', 'ru', 'lv'];

// Telegram til kodidan til tanlash (ilovadagi qoida bilan bir xil)
export function langFrom(code) {
  const c = String(code || '').toLowerCase();
  if (c.startsWith('uz')) return 'uz';
  if (c.startsWith('ru')) return 'ru';
  if (c.startsWith('lv')) return 'lv';
  return c ? 'en' : 'uz';
}
// Mijoz yuborgan til to'g'ri bo'lsa o'sha, bo'lmasa Telegram tili
export const pickLang = (sent, tgCode) => (LANG_CODES.includes(sent) ? sent : langFrom(tgCode));

const DAYS = {
  uz: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  lv: ['Svētdiena', 'Pirmdiena', 'Otrdiena', 'Trešdiena', 'Ceturtdiena', 'Piektdiena', 'Sestdiena'],
};
const MONTHS = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  lv: ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'],
};

// Xabar matnlari. head = qalin sarlavha, foot = oxirgi gap. kind: in (yozildi), wait (navbatda), remind (eslatma)
const MSG = {
  uz: {
    game: "Futbol o'yini",
    in: { head: "✅ Ro'yxatdan o'tdingiz!", foot: "Iltimos, kechikmasdan keling. Ko'rishguncha! 👋" },
    wait: { head: '⏳ Siz navbat ro\'yxatidasiz', foot: "Hozircha joy yetarli emas. Joy bo'shasa, ro'yxatga o'tasiz. Holatni ilovada ko'rishingiz mumkin." },
    remind: {
      head: "⏰ Futbol o'yini eslatmasi",
      greet: '👋 Assalomu alaykum!',
      intro: "Eslatib o'tamiz: siz futbol o'yiniga yozilgansiz. O'yin haqida ma'lumot:",
      foot: "Iltimos, kechikmasdan keling va o'yinni o'tkazib yubormang! 🙌\nKela olmasangiz, ilovada ro'yxatdan chiqing, boshqa o'yinchilarga joy bo'shaydi. Aks holda siz bloklanishingiz mumkin.",
    },
    label: { game: "⚽ O'yin", date: '📅 Kun', time: '🕗 Soat', place: '📍 Joy' },
    rules: "📋 O'yin qoidalari",
    open: '📋 Ilovani ochish',
    map: "📍 Xaritada ko'rish",
  },
  en: {
    game: 'Football game',
    in: { head: "✅ You're registered!", foot: 'Please arrive on time. See you there! 👋' },
    wait: { head: "⏳ You're on the waiting list", foot: "There aren't enough spots right now. If a spot opens up, you'll move onto the list. You can check your status in the app." },
    remind: {
      head: '⏰ Football game reminder',
      greet: '👋 Hello!',
      intro: "Just a reminder: you're signed up for a football game. Game details:",
      foot: "Please don't be late and don't miss the game! 🙌\nIf you can't make it, cancel your registration in the app so other players can take your spot. Otherwise, you may be blocked.",
    },
    label: { game: '⚽ Game', date: '📅 Date', time: '🕗 Time', place: '📍 Location' },
    rules: '📋 Game rules',
    open: '📋 Open the app',
    map: '📍 View on map',
  },
  ru: {
    game: 'Футбольная игра',
    in: { head: '✅ Вы записаны!', foot: 'Пожалуйста, приходите вовремя. До встречи! 👋' },
    wait: { head: '⏳ Вы в списке ожидания', foot: 'Сейчас мест недостаточно. Если место освободится, вы попадёте в список. Статус можно посмотреть в приложении.' },
    remind: {
      head: '⏰ Напоминание об игре',
      greet: '👋 Здравствуйте!',
      intro: 'Напоминаем: вы записаны на футбольную игру. Информация об игре:',
      foot: 'Пожалуйста, не опаздывайте и не пропустите игру! 🙌\nЕсли не сможете прийти, отмените запись в приложении, чтобы место досталось другим игрокам. В противном случае вас могут заблокировать.',
    },
    label: { game: '⚽ Игра', date: '📅 Дата', time: '🕗 Время', place: '📍 Место' },
    rules: '📋 Правила игры',
    open: '📋 Открыть приложение',
    map: '📍 Показать на карте',
  },
  lv: {
    game: 'Futbola spēle',
    in: { head: '✅ Pieteikšanās veiksmīga!', foot: 'Lūdzu, ierodieties laikā. Uz tikšanos! 👋' },
    wait: { head: '⏳ Jūs esat gaidīšanas sarakstā', foot: 'Pašlaik nepietiek vietu. Ja vieta atbrīvosies, pieteikums tiks pārcelts uz sarakstu. Statusu varat apskatīt lietotnē.' },
    remind: {
      head: '⏰ Atgādinājums par spēli',
      greet: '👋 Sveiki!',
      intro: 'Atgādinām: jums ir pieteikums futbola spēlei. Informācija par spēli:',
      foot: 'Lūdzu, nekavējieties un neizlaidiet spēli! 🙌\nJa nevarat ierasties, atceliet pieteikumu lietotnē, lai vietu varētu ieņemt citi spēlētāji. Pretējā gadījumā jūsu profils var tikt bloķēts.',
    },
    label: { game: '⚽ Spēle', date: '📅 Datums', time: '🕗 Laiks', place: '📍 Vieta' },
    rules: '📋 Spēles noteikumi',
    open: '📋 Atvērt lietotni',
    map: '📍 Skatīt kartē',
  },
};

// Sana va soat (Riga vaqti bilan), tanlangan tilda
export function whenParts(ts, lang) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ts));
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  const d = +p.day;
  const m = +p.month - 1;
  const dow = new Date(Date.UTC(+p.year, m, d)).getUTCDay();
  const day = DAYS[lang][dow];
  const mon = MONTHS[lang][m];
  const date =
    lang === 'en' ? `${day}, ${mon} ${d}` : lang === 'ru' ? `${day}, ${d} ${mon}` : lang === 'lv' ? `${day}, ${d}. ${mon}` : `${day}, ${d}-${mon}`;
  return { date, time: `${p.hour}:${p.minute}` };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Tayyor xabar: { text (HTML), reply_markup (tugmalar) }
// Eslatma (remind) batafsil: salomlashish, o'yin haqida ma'lumot (nomi, kun, soat, joy) va qoidalar (rules.js, bo'sh bo'lsa chiqmaydi)
export function buildMessage(kind, g, lang, env, rules = GAME_RULES) {
  const L = MSG[lang] || MSG.uz;
  const lg = MSG[lang] ? lang : 'uz';
  const w = whenParts(g.ts, lg);
  const title = !g.title || g.title === DEFAULT_TITLE ? L.game : g.title;
  let lines;
  if (kind === 'remind') {
    const k = L.label;
    lines = [`<b>${esc(L.remind.head)}</b>`, '', `${esc(L.remind.greet)} ${esc(L.remind.intro)}`, '', `${k.game}: ${esc(title)}`, `${k.date}: ${esc(w.date)}`, `${k.time}: ${w.time}`];
    if (g.place) lines.push(`${k.place}: ${esc(g.place)}`);
    const r = String((rules && rules[lg]) || '').trim();
    if (r) lines.push('', `<b>${esc(L.rules)}</b>`, esc(r));
  } else {
    lines = [`<b>${esc(L[kind].head)}</b>`, '', `⚽ ${esc(title)}`, `📅 ${esc(w.date)}`, `🕗 ${w.time}`];
    if (g.place) lines.push(`📍 ${esc(g.place)}`);
  }
  lines.push('', esc(L[kind].foot));
  const buttons = [[{ text: L.open, web_app: { url: webAppUrl(env) } }]];
  if (g.map_url) buttons.push([{ text: L.map, url: g.map_url }]);
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: buttons } };
}

// Yuborish natijasi: 'ok' | 'dead' (odam botni bloklagan / chat yo'q: qayta urinmaymiz) | 'retry' (vaqtincha xato)
export async function sendTo(env, chatId, msg) {
  try {
    const r = await tgCall(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', disable_web_page_preview: true, ...msg });
    if (r && r.ok) return 'ok';
    const code = r && r.error_code;
    if (code === 403 || code === 400) return 'dead';
    console.error('sendMessage', code, r && r.description);
    return 'retry';
  } catch (e) {
    console.error(e);
    return 'retry';
  }
}


// ---------- Moderatsiya xabarlari: ogohlantirish va blok ----------
// Muddat matni: nom = "1 hafta", for = "1 haftaga" (har tilda o'z shakli)
function duration(lang, days) {
  const w = days / 7;
  if (!Number.isInteger(w)) {
    return { uz: { nom: `${days} kun`, to: `${days} kunga` }, en: { nom: `${days} days`, to: `for ${days} days` }, ru: { nom: `${days} дн.`, to: `на ${days} дн.` }, lv: { nom: `${days} dienas`, to: `uz ${days} dienām` } }[lang];
  }
  const one = w % 10 === 1 && w % 100 !== 11;
  const few = w % 10 >= 2 && w % 10 <= 4 && (w % 100 < 12 || w % 100 > 14);
  if (lang === 'en') return { nom: `${w} week${w > 1 ? 's' : ''}`, to: `for ${w} week${w > 1 ? 's' : ''}` };
  if (lang === 'ru') return { nom: `${w} ${one ? 'неделя' : few ? 'недели' : 'недель'}`, to: `на ${w} ${one ? 'неделю' : few ? 'недели' : 'недель'}` };
  if (lang === 'lv') return { nom: `${w} ${one ? 'nedēļa' : 'nedēļas'}`, to: `uz ${w} ${one ? 'nedēļu' : 'nedēļām'}` };
  return { nom: `${w} hafta`, to: `${w} haftaga` };
}

const MOD = {
  uz: {
    warn: { head: '⚠️ Ogohlantirish', intro: "Siz quyidagi futbol o'yiniga kelmadingiz:", body: (d) => `Bu sizning oxirgi imkoniyatingiz. Agar yana o'yinga kelmasangiz, akkauntingiz ${d.to} bloklanadi va shu vaqt davomida ro'yxatdan o'ta olmaysiz.\n\nKela olmasangiz, oldindan ilovada ro'yxatdan chiqing: boshqa o'yinchilarga joy bo'shaydi.\nSavollar bo'lsa, admin bilan bog'laning.` },
    block: { head: '⛔ Akkauntingiz vaqtincha bloklandi', intro: (d) => `Siz futbol o'yinlariga ikki marta kelmadingiz, shuning uchun ro'yxatdan o'tishingiz ${d.to} cheklandi.`, len: (d) => `🔒 Blok muddati: ${d.nom}`, until: (dt) => `📅 Qayta ro'yxatdan o'ta olasiz: ${dt.date}, ${dt.time} dan keyin`, cancelled: "Shu davrdagi o'yinlarga yozuvlaringiz bekor qilindi.", foot: "Savol yoki e'tiroz bo'lsa, admin bilan bog'laning." },
  },
  en: {
    warn: { head: '⚠️ Warning', intro: 'You missed this football game:', body: (d) => `This is your last chance. If you miss another game, your account will be blocked ${d.to} and you won't be able to register during that time.\n\nIf you can't make it, cancel your registration in the app in advance so another player can take your spot.\nIf you have questions, contact the admin.` },
    block: { head: '⛔ Your account is temporarily blocked', intro: (d) => `You have missed two games, so registration is restricted ${d.to}.`, len: (d) => `🔒 Block length: ${d.nom}`, until: (dt) => `📅 You can register again after: ${dt.date}, ${dt.time}`, cancelled: 'Your registrations for games during this period were cancelled.', foot: 'If you have questions or objections, contact the admin.' },
  },
  ru: {
    warn: { head: '⚠️ Предупреждение', intro: 'Вы не пришли на футбольную игру:', body: (d) => `Это ваш последний шанс. Если вы снова не придёте на игру, ваш аккаунт будет заблокирован ${d.to}, и в это время вы не сможете записываться.\n\nЕсли не сможете прийти, заранее отмените запись в приложении, чтобы место досталось другому игроку.\nЕсли есть вопросы, свяжитесь с администратором.` },
    block: { head: '⛔ Ваш аккаунт временно заблокирован', intro: (d) => `Вы дважды не пришли на игры, поэтому запись ограничена ${d.to}.`, len: (d) => `🔒 Срок блокировки: ${d.nom}`, until: (dt) => `📅 Снова записаться можно после: ${dt.date}, ${dt.time}`, cancelled: 'Ваши записи на игры в этот период отменены.', foot: 'Если есть вопросы или возражения, свяжитесь с администратором.' },
  },
  lv: {
    warn: { head: '⚠️ Brīdinājums', intro: 'Jūs neieradāties uz šo futbola spēli:', body: (d) => `Šī ir jūsu pēdējā iespēja. Ja vēlreiz neieradīsieties uz spēli, jūsu profils tiks bloķēts ${d.to} un šajā laikā nevarēsiet pieteikties.\n\nJa nevarat ierasties, iepriekš atceliet pieteikumu lietotnē, lai vietu varētu ieņemt cits spēlētājs.\nJa ir jautājumi, sazinieties ar administratoru.` },
    block: { head: '⛔ Jūsu profils uz laiku bloķēts', intro: (d) => `Jūs divreiz neieradāties uz spēlēm, tāpēc pieteikšanās ir ierobežota ${d.to}.`, len: (d) => `🔒 Bloķēšanas ilgums: ${d.nom}`, until: (dt) => `📅 Atkal pieteikties varēsiet pēc: ${dt.date}, ${dt.time}`, cancelled: 'Jūsu pieteikumi spēlēm šajā periodā ir atcelti.', foot: 'Ja ir jautājumi vai iebildumi, sazinieties ar administratoru.' },
  },
};

// kind: 'warn' | 'block'. extra: { until, cancelled } (blok uchun)
export function buildModeration(kind, g, lang, env, extra = {}) {
  const lg = MOD[lang] ? lang : 'uz';
  const L = MSG[lg];
  const M = MOD[lg][kind];
  const d = duration(lg, BLOCK_DAYS);
  const w = whenParts(g.ts, lg);
  const title = !g.title || g.title === DEFAULT_TITLE ? L.game : g.title;
  let lines;
  if (kind === 'warn') {
    lines = [`<b>${esc(M.head)}</b>`, '', esc(M.intro), '', `${L.label.game}: ${esc(title)}`, `${L.label.date}: ${esc(w.date)}`, `${L.label.time}: ${w.time}`, '', esc(M.body(d))];
  } else {
    const u = whenParts(extra.until, lg);
    lines = [`<b>${esc(M.head)}</b>`, '', esc(M.intro(d)), '', esc(M.len(d)), esc(M.until(u))];
    if (extra.cancelled) lines.push('', esc(M.cancelled));
    lines.push('', esc(M.foot));
  }
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: [[{ text: L.open, web_app: { url: webAppUrl(env) } }]] } };
}

// Moderatsiya xabarini yuborish (xato bo'lsa jim o'tadi; belgilash/blok bekor bo'lmaydi)
export async function notifyModeration(env, kind, g, uid, lang, extra) {
  await sendTo(env, uid, buildModeration(kind, g, lang, env, extra));
}

// Ro'yxatdan o'tgandan keyin: tasdiq xabari (navbatda bo'lsa, boshqa matn)
export async function notifyRegistered(env, g, uid, lang) {
  const regs = (await env.DB.prepare('SELECT * FROM registrations WHERE game_id = ? ORDER BY created_at, id').bind(g.id).all()).results;
  const row = seatRegs(regs, g.capacity).rows.find((x) => x.r.uid === uid);
  if (!row) return;
  await sendTo(env, uid, buildMessage(row.wait ? 'wait' : 'in', g, lang, env));
}

const markReminded = (env, ids, value) =>
  ids.length
    ? env.DB.prepare(`UPDATE registrations SET reminded = ? WHERE id IN (${ids.map(() => '?').join(',')})`).bind(value, ...ids).run()
    : null;

// Cron: o'yinigacha 24 soat yoki kamroq qolgan va hali eslatma olmagan odamlarga eslatma yuboradi.
// Navbatdagilarga (sig'masa) yubormaydi: ular ro'yxatga o'tgach, keyingi ishga tushishda oladi.
export async function sendReminders(env, now = Date.now()) {
  await ensureSchema(env);
  const games = (
    await env.DB.prepare('SELECT * FROM games WHERE ts > ? AND ts <= ? ORDER BY ts').bind(now, now + REMIND_BEFORE_MS).all()
  ).results;
  const sent = [];
  const dead = [];
  let budget = REMIND_BATCH;
  for (const g of games) {
    if (budget <= 0) break;
    const regs = (await env.DB.prepare('SELECT * FROM registrations WHERE game_id = ? ORDER BY created_at, id').bind(g.id).all()).results;
    for (const { r, wait } of seatRegs(regs, g.capacity).rows) {
      if (wait || r.reminded || budget <= 0) continue;
      budget--;
      const res = await sendTo(env, r.uid, buildMessage('remind', g, MSG[r.lang] ? r.lang : 'uz', env));
      if (res === 'ok') sent.push(r.id);
      else if (res === 'dead') dead.push(r.id);
    }
  }
  await markReminded(env, sent, 1);
  await markReminded(env, dead, 2);
  return { sent: sent.length, dead: dead.length };
}
