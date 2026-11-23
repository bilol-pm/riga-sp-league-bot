/* Kichik yordamchilar: HTML xavfsizlash, sana/vaqt formatlash, telefon va email tekshirish. */

const pad = n => String(n).padStart(2, '0');
const initial = s => (Array.from(String(s || '').trim())[0] || '?').toUpperCase();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = ts => { const d = new Date(ts); return `${dayName(d.getDay())}, ${dm(d.getDate(), d.getMonth())}`; };
const fmtTime = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mondayOf = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const nextSaturday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); return d; };
const okPhone = s => /^\+?[0-9 ()-]{7,20}$/.test(String(s).trim());
const okEmail = s => /^\S+@\S+\.\S+$/.test(String(s).trim());
const gTitle = g => (!g.title || g.title === "Futbol o'yini") ? t("Futbol o'yini") : g.title;
