/**
 * index.html dagi ?v=N raqamini 1 ga oshiradi (CSS/JS fayllarni brauzer keshidan yangilash uchun).
 * Frontend'ni o'zgartirib GitHub'ga yuborishdan oldin ishga tushiring:
 *     node scripts/bump-version.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const html = readFileSync(file, 'utf8');
const m = html.match(/\?v=(\d+)/);
if (!m) throw new Error('index.html da ?v=N topilmadi');
const next = Number(m[1]) + 1;
writeFileSync(file, html.replace(/\?v=\d+/g, `?v=${next}`));
console.log(`Versiya: ${m[1]} -> ${next}`);
