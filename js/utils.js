/* Kichik yordamchilar: HTML xavfsizlash, sana/vaqt formatlash, telefon va email tekshirish. */

const pad = n => String(n).padStart(2, '0');
const initial = s => (Array.from(String(s || '').trim())[0] || '?').toUpperCase();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = ts => { const d = new Date(ts); return `${dayName(d.getDay())}, ${dm(d.getDate(), d.getMonth())}`; };
const fmtTime = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mondayOf = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const nextSaturday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); return d; };
/* Telefon: faqat Latviya raqami. Maydonda "+371" qo'zg'almas, odam 8 ta raqam yozadi; saqlanadigan ko'rinish: +371XXXXXXXX */
const localDigits = s => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('00371')) d = d.slice(5); else if (d.startsWith('371') && d.length > 8) d = d.slice(3); return d.slice(0, 8); };
const fullPhone = s => { const d = localDigits(s); return d ? '+371' + d : ''; };
const okPhone = s => /^\+371\d{8}$/.test(fullPhone(s));
/* Email: shakl + mashhur domenlardagi xato (gmail.con, gmial.com, icloud.co ...). Serverdagi validate.js bilan bir xil qoidalar */
const okEmail = s => { const e = String(s).trim().toLowerCase(); return e.length <= 80 && !e.includes('..') && /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(e); };
const POPULAR_MAIL = ['gmail.com', 'icloud.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
const REAL_MAIL = new Set([...POPULAR_MAIL, 'googlemail.com', 'mail.com', 'email.com', 'me.com', 'mac.com', 'live.com', 'msn.com', 'ymail.com', 'aol.com',
  'gmx.com', 'gmx.de', 'gmx.net', 'yahoo.de', 'yahoo.fr', 'yahoo.it', 'yahoo.es', 'yahoo.co.uk', 'hotmail.co.uk', 'hotmail.de', 'hotmail.fr',
  'outlook.de', 'outlook.fr', 'outlook.lv', 'mail.ru', 'yandex.ru', 'yandex.com', 'ya.ru', 'inbox.lv', 'inbox.ru', 'list.ru', 'bk.ru',
  'tvnet.lv', 'apollo.lv', 'proton.me', 'protonmail.com', 'pm.me']);
const editDist = (a, b) => { let p = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[b.length]; };
const emailTypo = s => { const dom = String(s).trim().toLowerCase().split('@').pop(); return REAL_MAIL.has(dom) ? '' : (POPULAR_MAIL.find(p => editDist(dom, p) <= 2) || ''); };
// Email xatosi bo'lsa matn qaytaradi, to'g'ri bo'lsa ''
const emailError = s => { if (!okEmail(s)) return t("Email manzilni to'g'ri kiriting"); const d = emailTypo(s); return d ? t("Email domeni xato yozilgan. {d} demoqchimisiz?", { d }) : ''; };
const PHONE_ERR = "Telefon raqam +371 bilan boshlanib, 8 ta raqamdan iborat bo'lsin";
const fmtWhen = ts => `${fmtDate(ts)}, ${fmtTime(ts)}`;
const gTitle = g => (!g.title || g.title === "Futbol o'yini") ? t("Futbol o'yini") : g.title;
