/**
 * Server sozlamalari (o'zgarmas qiymatlar).
 * Cloudflare'dagi o'zgaruvchilar (DB, BOT_TOKEN, OWNER_IDS, ALLOWED_ORIGIN) bu yerda emas:
 * ular Cloudflare panelida kiritiladi, kodda `env.NOM` orqali o'qiladi.
 */
export const TEAM_SIZE = 7;                    // bitta jamoadagi o'yinchilar soni
export const MAX_AUTH_AGE = 3 * 24 * 3600;     // Telegram imzosi necha soniya amal qiladi
export const HISTORY_DAYS = 8;                 // o'tgan o'yinlar necha kun ko'rsatiladi
export const MAX_BODY_BYTES = 20000;           // so'rov hajmi chegarasi
export const DEFAULT_TITLE = "Futbol o'yini";  // admin sarlavha yozmasa
export const DEFAULT_ORIGIN = 'https://bilol-pm.github.io';   // ALLOWED_ORIGIN berilmasa
export const DEFAULT_WEBAPP_URL = 'https://bilol-pm.github.io/riga-sp-league-bot/';   // Mini App manzili (WEBAPP_URL berilmasa)
export const TIMEZONE = 'Europe/Riga';        // xabarlarda sana va soat shu vaqt mintaqasida yoziladi
export const REMIND_BEFORE_MS = 24 * 3600 * 1000;   // eslatma o'yindan necha soat oldin ketadi (24 soat)
export const REMIND_BATCH = 40;                // bitta cron ishga tushishida eng ko'pi bilan nechta xabar (Cloudflare bepul limiti)
export const STRIKES_TO_BLOCK = 2;             // nechta "kelmadi"dan keyin o'yinchi avtomatik bloklanadi
export const BLOCK_DAYS = 7;                   // blok muddati (kun): 7 = 1 hafta
