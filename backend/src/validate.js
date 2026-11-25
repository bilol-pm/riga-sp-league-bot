/**
 * Telefon va email tekshirish.
 *   parsePhone / parseEmail : kiritilgan qiymat to'g'rimi (ro'yxatdan o'tishda)
 *   phoneKey / emailKey     : bir odamni topish uchun "kalit" (bloklashda: bir xil raqam yoki email = bir odam)
 */

// Telefon: faqat Latviya raqami: +371 va 8 ta raqam. To'g'ri bo'lsa "+371XXXXXXXX", bo'lmasa null.
export function parsePhone(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\s().-]/g, '');
  const m = /^\+371(\d{8})$/.exec(s);
  return m ? '+371' + m[1] : null;
}

// Faqat raqamlar; 8 xonali bo'lsa 371 qo'shiladi. Eski yozuvlardagi turli yozilishlar ham bir xil chiqadi.
export function phoneKey(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '371' + d;
  return d;
}

// Ko'p ishlatiladigan pochta domenlari: ularning xato yozilganini (gmail.con, gmial.com, icloud.co...) ushlaymiz
const POPULAR = ['gmail.com', 'icloud.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
// Haqiqiy domenlar (ular yuqoridagilarga o'xshash, lekin xato emas)
const REAL = new Set([
  ...POPULAR, 'googlemail.com', 'mail.com', 'email.com', 'me.com', 'mac.com', 'live.com', 'msn.com', 'ymail.com', 'aol.com',
  'gmx.com', 'gmx.de', 'gmx.net', 'yahoo.de', 'yahoo.fr', 'yahoo.it', 'yahoo.es', 'yahoo.co.uk', 'hotmail.co.uk', 'hotmail.de', 'hotmail.fr',
  'outlook.de', 'outlook.fr', 'outlook.lv', 'mail.ru', 'yandex.ru', 'yandex.com', 'ya.ru', 'inbox.lv', 'inbox.ru', 'list.ru', 'bk.ru',
  'tvnet.lv', 'apollo.lv', 'proton.me', 'protonmail.com', 'pm.me',
]);

function lev(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

// -> { ok: true, email } yoki { ok: false, suggest: 'gmail.com' | null }
export function parseEmail(raw) {
  const email = String(raw == null ? '' : raw).trim().toLowerCase();
  if (email.length > 80 || email.includes('..') || !EMAIL_RE.test(email)) return { ok: false, suggest: null };
  const dom = email.slice(email.lastIndexOf('@') + 1);
  if (!REAL.has(dom)) {
    const near = POPULAR.find((p) => lev(dom, p) <= 2);
    if (near) return { ok: false, suggest: near };
  }
  return { ok: true, email };
}

// Bir odamning turli yozilgan emaillari bir xil kalit beradi: katta/kichik harf, "+yorliq", gmail nuqtalari
export function emailKey(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1) return s;
  let local = s.slice(0, at).split('+')[0];
  let dom = s.slice(at + 1);
  if (dom === 'googlemail.com') dom = 'gmail.com';
  if (dom === 'gmail.com') local = local.replace(/\./g, '');
  return local + '@' + dom;
}
