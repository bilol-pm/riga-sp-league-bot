/** Kichik yordamchi funksiyalar: matn tozalash, son o'qish, JSON xavfsiz o'qish. */

// Boshqaruv belgilarini olib tashlaydi va chetlarini kesadi
export const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
// Matnni tozalab, eng ko'pi bilan `max` belgigacha qisqartiradi
export const str = (v, max) => clean(v).slice(0, max);
// Butun son yoki NaN (noto'g'ri bo'lsa)
export const int = (v) =>
  (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v)
    ? Math.trunc(+v)
    : NaN;
// "123, 456" -> [123, 456]
export const parseIds = (s) =>
  String(s || '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
export const safeJson = (s, fallback) => {
  try {
    const v = JSON.parse(s);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
};
// Vaqtga bog'liq bo'lmagan satr solishtirish (imzoni tekshirishda)
export const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};
