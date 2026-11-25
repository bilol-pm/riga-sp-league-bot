/* Qayta ishlatiladigan interfeys bo'laklari: logo, avatar, tepa qism (header) va til tanlagich,
   progress, joy/vaqt qatorlari, asosiy tugma, belgi (badge). */

const LOGO = '<img class="logo" alt="Riga Street Power League" src="assets/logo.webp">';   // fayl: assets/logo.webp
const avatarHtml = () => `<div class="avatar">${MY_PHOTO ? `<img src="${esc(MY_PHOTO)}">` : (MY_NAME ? esc(initial(MY_NAME)) : '👤')}</div>`;
const GLOBE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4"/><path d="M12 2.8c2.6 2.5 4 5.7 4 9.2s-1.4 6.7-4 9.2c-2.6-2.5-4-5.7-4-9.2s1.4-6.7 4-9.2z"/></svg>`;
function langHtml() {
  const cur = LANGS.find(l => l[0] === LANG) || LANGS[0];
  const menu = state.langOpen ? `<div class="langmenu" role="menu">${LANGS.map(l => `<button class="langopt ${l[0] === LANG ? 'on' : ''}" data-a="setlang" data-id="${l[0]}" role="menuitem">
      <span class="lcode">${l[2]}</span><span class="lname">${l[1]}</span><span class="lchk">${l[0] === LANG ? '✓' : ''}</span></button>`).join('')}</div>` : '';
  return `<div class="langbox"><button class="langbtn ${state.langOpen ? 'on' : ''}" data-a="lang" aria-label="Language" aria-expanded="${state.langOpen}">${GLOBE}<span>${cur[2]}</span></button>${menu}</div>`;
}
function topHtml() {
  return `<div class="top">${LOGO}<div class="grow"><div class="league">${t('Riga Street Power Liga')}</div>${nick() ? `<div class="sub">${esc(nick())}</div>` : ''}</div>${langHtml()}</div>`;
}
function progress(g) {
  // Nechta odam yozilgani, sig'im va bo'sh joylar FAQAT adminga ko'rinadi
  if (!isAdmin()) return '';
  const pct = Math.min(100, g.used / g.capacity * 100);
  return `<div class="bar"><i style="width:${pct}%"></i></div>
    <div class="barrow"><span>${t("{a}/{b} o'yinchi", { a: g.used, b: g.capacity })}</span><span>${g.waiting ? t('{n} kishi navbatda', { n: g.waiting }) : t("{n} ta bo'sh joy", { n: freeOf(g) })}</span></div>`;
}
function placeHtml(g) {
  const pl = g.place ? esc(g.place) : t("Joy keyin e'lon qilinadi");
  return g.place && g.mapUrl ? `<span class="maplink" data-a="map" data-id="${g.id}">${pl}</span>` : pl;
}
const metaHtml = g => `<div class="meta"><span>📅 ${fmtDate(g.ts)}</span><span>🕗 ${fmtTime(g.ts)}</span><span>📍 ${placeHtml(g)}</span></div>`;
/* Telefon maydoni: "+371" qo'zg'almas, odam faqat 8 ta raqam yozadi. attr: data-f="phone" yoki data-pf="phone" */
const phoneInput = (attr, v) => `<div class="phone"><span>+371</span><input type="tel" inputmode="numeric" autocomplete="tel-national" ${attr} placeholder="20 000 000" value="${esc(localDigits(v))}"></div>
  <div class="hint">${t("Latviya raqami: +371 va 8 ta raqam")}</div>`;
/* Bloklangan o'yinchi: serverdan kelgan blok tugash vaqti */
const blockedUntil = () => (!isAdmin() && state.me && state.me.blockedUntil > Date.now()) ? state.me.blockedUntil : 0;
const blockNote = () => blockedUntil() ? `<div class="note block">${t("⛔ Akkauntingiz vaqtincha bloklangan. Qayta ro'yxatdan o'tish mumkin: {when} dan keyin.", { when: fmtWhen(blockedUntil()) })}</div>` : '';
function actionBtn(g) {
  if (isAdmin()) return '';   // adminlar o'yinga yozilmaydi, faqat boshqaradi
  if (g.ts <= Date.now()) return `<button class="btn ghost" disabled>${t("O'yin o'tgan")}</button>`;
  if (!isReg(g) && blockedUntil()) return `<button class="btn ghost" disabled>${t("Bloklangansiz")}</button>`;
  return isReg(g)
    ? `<button class="btn out" data-a="cancel" data-id="${g.id}">${t("Ro'yxatdan chiqish")}</button>`
    : `<button class="btn" data-a="reg" data-id="${g.id}">${t("Ro'yxatdan o'tish")}</button>`;
}
function badge(g) {
  if (g.ts <= Date.now()) return `<span class="tag full">${t("O'tgan")}</span>`;
  const s = statusOf(g);
  if (s === 'ok') return `<span class="tag ok">${t("Yozildingiz")}</span>`;
  if (s === 'wait') return `<span class="tag wait">${t("Navbatda")}</span>`;
  return isAdmin() && freeOf(g) === 0 ? `<span class="tag full">${t("To'lgan")}</span>` : '';
}
