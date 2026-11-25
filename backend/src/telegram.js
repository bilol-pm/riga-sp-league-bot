/**
 * Telegram bot qismi: /start ga javob (webhook). Kompyuterda bot.py ishlab turishi shart emas.
 *
 *   POST /telegram/webhook   Telegram yangilanishlarni shu manzilga yuboradi
 *   GET  /telegram/setup     BIR MARTA ochiladi: webhook va menyu tugmasini Telegram'da o'rnatadi
 *
 * Cloudflare'da kerak: BOT_TOKEN (bor), WEBHOOK_SECRET (Secret, o'zingiz o'ylab topgan uzun matn:
 * faqat harf, raqam, _ va -). Ixtiyoriy: WEBAPP_URL.
 */
import { DEFAULT_WEBAPP_URL } from './config.js';
import { HttpError, json } from './http.js';
import { safeEqual } from './utils.js';

// /start javobi: BITTA xabar, hamma tillar ketma-ket (o'zbekcha birinchi). Tilni aniqlash shart emas.
// Matnni o'zgartirmoqchi bo'lsangiz, faqat shu yerni tahrirlang.
const WELCOME = [
  '⚽ Riga Street Power League',
  "🇺🇿 Assalomu alaykum! Riga Street Power Ligasiga xush kelibsiz. Futbol o'yiniga ro'yxatdan o'tish uchun pastdagi tugmani bosing.",
  '🇬🇧 Welcome to Riga Street Power League! Tap the button below to register for a football game.',
  '🇷🇺 Добро пожаловать в Riga Street Power League! Чтобы записаться на футбольную игру, нажмите кнопку ниже.',
  '🇱🇻 Laipni lūdzam Riga Street Power League! Lai pieteiktos futbola spēlei, nospiediet pogu zemāk.',
].join('\n\n');
const BUTTON = "⚽ O'yinlar · Games · Игры · Spēles";   // inline tugma (hamma tilda)
const MENU_BUTTON = "⚽ O'yinlar";                     // chap pastdagi menyu tugmasi

const webAppUrl = (env) => String(env.WEBAPP_URL || DEFAULT_WEBAPP_URL);

// Telegram Bot API ga so'rov
async function tgCall(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

const sameSecret = (given, env) => !!env.WEBHOOK_SECRET && safeEqual(String(given || ''), String(env.WEBHOOK_SECRET));

// Telegram yuborgan yangilanish: private chatdagi /start ga tugma bilan javob beramiz
async function onWebhook(req, env) {
  if (!env.WEBHOOK_SECRET) throw new HttpError(500, 'WEBHOOK_SECRET sozlanmagan');
  // Faqat Telegram bilishi mumkin bo'lgan maxfiy so'z bilan kelgan so'rovlar qabul qilinadi
  if (!sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), env)) throw new HttpError(401, 'Ruxsat yo\'q');

  let update = null;
  try {
    update = await req.json();
  } catch (e) {}
  const msg = update && update.message;
  const isStart = msg && typeof msg.text === 'string' && /^\/start(@\w+)?(\s|$)/.test(msg.text);
  if (isStart && msg.chat && msg.chat.type === 'private') {
    try {
      await tgCall(env, 'sendMessage', {
        chat_id: msg.chat.id,
        text: WELCOME,
        reply_markup: { inline_keyboard: [[{ text: BUTTON, web_app: { url: webAppUrl(env) } }]] },
      });
    } catch (e) {
      console.error(e);   // Telegram qayta-qayta yubormasligi uchun baribir 200 qaytaramiz
    }
  }
  return { ok: true };
}

// Bir marta: webhook'ni o'rnatadi va chap pastdagi menyu tugmasini qo'yadi
async function onSetup(req, env) {
  const url = new URL(req.url);
  if (!sameSecret(url.searchParams.get('secret'), env)) throw new HttpError(403, "Maxfiy so'z noto'g'ri yoki WEBHOOK_SECRET sozlanmagan");
  const webhook = await tgCall(env, 'setWebhook', {
    url: `${url.origin}/telegram/webhook`,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ['message'],
  });
  const menu = await tgCall(env, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: MENU_BUTTON, web_app: { url: webAppUrl(env) } },
  });
  return { ok: !!(webhook.ok && menu.ok), webhook, menu };
}

// index.js dan chaqiriladi: /telegram/... yo'llari
export async function handleTelegram(req, env, path, ch) {
  if (!env.BOT_TOKEN) throw new HttpError(500, 'BOT_TOKEN sozlanmagan');
  if (path === '/telegram/webhook' && req.method === 'POST') return json(await onWebhook(req, env), 200, ch);
  if (path === '/telegram/setup' && req.method === 'GET') return json(await onSetup(req, env), 200, ch);
  throw new HttpError(404, 'Topilmadi');
}
