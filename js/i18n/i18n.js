/* Tillar (uz / en / ru): tanlangan tilni aniqlash, t() tarjima funksiyasi, serverdan kelgan xatolarni tarjima qilish.
   Tarjima matnlari js/i18n/locales/ papkasida. Kalit sifatida O'ZBEKCHA matn ishlatiladi. */

const LANGS = [['uz', "O'zbekcha", 'UZ'], ['en', 'English', 'EN'], ['ru', 'Русский', 'RU']];
const LANG_KEY = 'rsp_lang';
const I18N = { en: LOCALE_EN, ru: LOCALE_RU };
function initLang() {
  try { const v = localStorage.getItem(LANG_KEY); if (LANGS.some(l => l[0] === v)) return v; } catch (e) {}
  const c = String((tu && tu.language_code) || navigator.language || '').toLowerCase();
  if (c.startsWith('uz')) return 'uz';
  if (c.startsWith('ru')) return 'ru';
  return c ? 'en' : 'uz';
}
let LANG = initLang();
// Kalit: o'zbekcha matn. {nom} joylar qiymat bilan almashtiriladi.
function t(s, v) {
  let r = (I18N[LANG] && I18N[LANG][s]) || s;
  if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
  return r;
}
const srvErr = m => { const x = /^(\d+) ta o'yinchining hammasini kiriting$/.exec(m || ''); return x ? t("{n} ta o'yinchining hammasini kiriting", { n: x[1] }) : t(m); };
function setLang(l) {
  LANG = l; try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  document.documentElement.lang = l; document.title = t('Riga Street Power Liga');
}
