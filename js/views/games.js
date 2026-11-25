/* "Asosiy" sahifa: yuklanish/xato holati, keyingi o'yin kartochkasi (hero) va kalendar. */

function viewBoot() {
  if (state.error) {
    return topHtml() + `<div class="empty"><div class="big">📡</div>${esc(state.error)}<br><br>
      <button class="btn" data-a="retry">${t("Qayta urinish")}</button></div>`;
  }
  return topHtml() + `<div class="empty"><div class="big">⚽</div>${t("Yuklanmoqda…")}</div>`;
}

/* Asosiy sahifa: keyingi o'yin + o'yin sanalari + kalendar */
function viewGames() {
  const note = (INIT ? '' : `<div class="note">${t("Ro'yxatdan o'tish uchun bu sahifani Telegramdagi bot orqali oching.")}</div>`) + blockNote();
  const list = upcoming();
  if (!list.length) {
    return topHtml() + note + `<div class="empty"><div class="big">📅</div>${t("Hozircha rejalashtirilgan o'yin yo'q.")}<br>${t("Yangi o'yin e'lon qilinishini kuting.")}</div>` + calendarHtml();
  }
  const next = list[0];
  const hero = `<div class="card hero">
    <div class="label">${t("Keyingi o'yin")}</div>
    <div class="count" id="cd" data-ts="${next.ts}"><div><b>--</b><small>${t("kun")}</small></div><div><b>--</b><small>${t("soat")}</small></div><div><b>--</b><small>${t("daqiqa")}</small></div><div><b>--</b><small>${t("soniya")}</small></div></div>
    <div class="title">${esc(gTitle(next))}</div>
    ${metaHtml(next)}
    ${progress(next)}
    ${actionBtn(next)}
    <button class="btn ghost" data-a="open" data-id="${next.id}">${t("Ro'yxatni ko'rish")}</button>
  </div>`;
  return topHtml() + note + hero + calendarHtml();
}
