/* Sozlamalar: server manzili va o'zgarmas qiymatlar. Eng ko'p tahrirlanadigan joy shu. */

// Server (Cloudflare Worker) manzili. Server joylashtirilgach shu yerga yoziladi.
const API_BASE = 'https://riga-sp-api.bilolpm111.workers.dev';
const TEAM_SIZE = 7;      // bitta jamoada 7 o'yinchi
const MAX_WEEKS = 12;     // kalendarda necha hafta oldinga o'tish mumkin
const POLL_MS = 45000;    // ma'lumot qanchada bir yangilanadi
const STRIKES_TO_BLOCK = 2;   // nechanchi "kelmadi"da akkaunt bloklanadi (serverdagi config.js bilan bir xil)
