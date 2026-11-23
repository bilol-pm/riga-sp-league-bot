/**
 * Backend'ni Cloudflare paneliga qo'yish uchun BITTA faylga yig'adi: dist/worker.js
 *
 * Ishlatish (Node.js 18+ kerak, hech narsa o'rnatish shart emas):
 *     cd backend
 *     node scripts/build.mjs
 *
 * Qanday ishlaydi: src/index.js dan boshlab `import` qatorlari bo'yicha hamma fayllarni topadi,
 * bir-biriga bog'liqlik tartibida ketma-ket yopishtiradi, `import` qatorlarini olib tashlaydi
 * va `export` so'zini o'chiradi (faqat oxirgi `export default` qoladi).
 * Shart: modullar orasida bir xil nomli yuqori darajadagi funksiya/o'zgaruvchi bo'lmasin.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'src');
const entry = resolve(src, 'index.js');

const IMPORT_RE = /^import\s+[^;]*?from\s+['"](.+?)['"];?\s*$/gm;
const order = [];
const seen = new Set();

function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(file, 'utf8');
  for (const m of code.matchAll(IMPORT_RE)) visit(resolve(dirname(file), m[1]));
  order.push(file);
}
visit(entry);

const parts = order.map((file) => {
  let code = readFileSync(file, 'utf8')
    .replace(IMPORT_RE, '')
    .replace(/^export\s+(?=(async\s+function|function|class|const|let)\b)/gm, '');
  if (file !== entry && /^export\s/m.test(code)) throw new Error(`Qo'llab-quvvatlanmaydigan export: ${file}`);
  const name = relative(root, file).replace(/\\/g, '/');
  return `// ===== ${name} =====\n${code.trim()}\n`;
});

const header = `// DIQQAT: bu fayl avtomatik yaratilgan (node scripts/build.mjs). Qo'lda tahrirlamang:\n// o'zgartirish kerak bo'lsa src/ ichidagi fayllarni tahrirlab, qayta yig'ing.\n\n`;
const out = header + parts.join('\n');
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/worker.js'), out);
console.log(`dist/worker.js tayyor: ${order.length} ta fayl, ${out.split('\n').length} qator`);
