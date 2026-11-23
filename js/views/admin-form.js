/* Admin: o'yin qo'shish / tahrirlash formasi. */

/* Admin: o'yin qo'shish / tahrirlash formasi */
function viewAdminForm() {
  const f = state.aform, editing = !!f.id;
  return `<button class="back" data-a="aback">${t("← Orqaga")}</button>
    <div class="card"><div class="g-title">${editing ? t("O'yinni tahrirlash") : t("Yangi o'yin")}</div>
      <div class="row2">
        <div><div class="field-l">${t("Sana")}</div><input type="date" data-af="date" value="${esc(f.date)}"></div>
        <div><div class="field-l">${t("Boshlanish vaqti")}</div><input type="time" data-af="time" value="${esc(f.time)}"></div>
      </div>
      <div class="field-l">${t("Joy (lokatsiya nomi)")}</div>
      <input type="text" data-af="place" maxlength="120" placeholder="${t('Masalan: Imanta stadioni')}" value="${esc(f.place)}">
      <div class="field-l">${t("Xarita havolasi (ixtiyoriy)")}</div>
      <input type="url" data-af="mapUrl" maxlength="300" placeholder="https://maps.google.com/..." value="${esc(f.mapUrl)}">
      <div class="field-l">${t("O'yinchilar soni (sig'im)")}</div>
      <input type="number" inputmode="numeric" min="1" max="200" data-af="capacity" value="${esc(f.capacity)}">
      <div class="hint">${t('{n} × jamoalar soni. 3 jamoa = {a}, 4 jamoa = {b}.', { n: TEAM_SIZE, a: TEAM_SIZE * 3, b: TEAM_SIZE * 4 })}</div>
      <div class="field-l">${t("Sarlavha (ixtiyoriy)")}</div>
      <input type="text" data-af="title" maxlength="60" placeholder="${t("Futbol o'yini")}" value="${esc(f.title)}">
      <button class="btn" data-a="asave">${editing ? t('Saqlash') : t("O'yinni qo'shish")}</button>
    </div>`;
}
