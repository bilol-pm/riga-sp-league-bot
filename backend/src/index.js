/**
 * Riga Street Power Liga: API serveri (Cloudflare Worker + D1).
 * Kirish nuqtasi: so'rov shu yerga keladi va kerakli bo'limga yo'naltiriladi.
 *
 * Cloudflare'da kerakli sozlamalar:
 *   DB              D1 baza (binding nomi aynan "DB")
 *   BOT_TOKEN       BotFather bergan token (Secret sifatida)
 *   OWNER_IDS       asoschi(lar) Telegram ID si, vergul bilan: 5310968084
 *   ALLOWED_ORIGIN  Mini App joylashgan sayt: https://bilol-pm.github.io
 *   WEBHOOK_SECRET  /start javobi (Telegram webhook) uchun maxfiy so'z, Secret sifatida
 *   WEBAPP_URL      ixtiyoriy: Mini App manzili (berilmasa config.js dagi ishlatiladi)
 */
import { HttpError, corsHeaders, json, readBody } from './http.js';
import { ensureSchema } from './db.js';
import { getMe } from './auth.js';
import { buildState } from './state.js';
import { ROUTES } from './routes/index.js';
import { handleTelegram } from './telegram.js';

export default {
  async fetch(req, env) {
    const ch = corsHeaders(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      // Telegram bot: /start javobi (baza va Mini App imzosi kerak emas)
      if (path.startsWith('/telegram/')) return await handleTelegram(req, env, path, ch);

      // Tekshiruv sahifasi: brauzerda ochsangiz "ready": true chiqishi kerak
      if (path === '/' && req.method === 'GET') {
        return json({ ok: true, service: 'riga-sp-league-api', ready: !!(env.DB && env.BOT_TOKEN), webhook: !!env.WEBHOOK_SECRET }, 200, ch);
      }
      if (!env.DB) throw new HttpError(500, 'Baza (DB) ulanmagan');
      if (!env.BOT_TOKEN) throw new HttpError(500, 'BOT_TOKEN sozlanmagan');
      await ensureSchema(env);

      const me = await getMe(req, env);

      if (path === '/api/state' && req.method === 'GET') {
        return json({ ok: true, state: await buildState(env, me) }, 200, ch);
      }

      const handler = ROUTES[path];
      if (!handler || req.method !== 'POST') throw new HttpError(404, 'Topilmadi');
      await handler(env, me, await readBody(req));
      return json({ ok: true, state: await buildState(env, me) }, 200, ch);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status, ch);
      console.error(e);
      return json({ ok: false, error: "Server xatosi. Birozdan keyin urinib ko'ring." }, 500, ch);
    }
  },
};
