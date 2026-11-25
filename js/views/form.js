/* Ro'yxatdan o'tish formasi: avval "Jamoam bor / Yakka o'zim", keyin ma'lumotlar. */

/* Ro'yxatdan o'tish: avval jamoa/yakka tanlanadi, keyin forma */
function viewForm() {
  const f = state.form, g = byId(f.gameId);
  if (!g) { state.form = null; return viewGames(); }
  const size = f.type === 'team' ? TEAM_SIZE : 1;
  const over = f.type && !fitsGame(g, size);
  let fields = '';
  if (f.type === 'solo') {
    fields = `
      <div class="field-l">${t("Ism")}</div>
      <input type="text" data-f="name" maxlength="40" placeholder="${t('Ismingiz')}" value="${esc(f.name)}">
      <div class="field-l">${t("Telefon raqam")}</div>
      ${phoneInput('data-f="phone"', f.phone)}
      <div class="field-l">Email</div>
      <input type="email" data-f="email" maxlength="80" placeholder="email@example.com" value="${esc(f.email)}">`;
  } else if (f.type === 'team') {
    const rows = f.members.map((m, i) => `<div class="mrow">
      <input type="text" data-f="m${i}" maxlength="40" placeholder="${t("{n}-o'yinchi ismi", { n: i + 1 })}" value="${esc(m)}">
      <button class="capbtn ${f.captain === i ? 'on' : ''}" data-a="cap" data-id="${i}" title="${t('Kapitan')}">⭐</button></div>`).join('');
    fields = `
      <div class="field-l">${t("Jamoa nomi (ixtiyoriy)")}</div>
      <input type="text" data-f="teamName" maxlength="40" placeholder="${t('Masalan: Burgutlar')}" value="${esc(f.teamName)}">
      <div class="field-l">${t("{n} ta o'yinchi ismi", { n: TEAM_SIZE })}</div>
      ${rows}
      <div class="hint">${t("⭐ Kapitanni belgilang. Kapitan jamoa uchun javob beradi: kim keldi, kim kelmadi.")}</div>
      <div class="field-l">${t('Kapitan: {name}. Telefon raqami', { name: esc((f.members[f.captain] || '').trim() || '—') })}</div>
      ${phoneInput('data-f="phone"', f.phone)}`;
  }
  return `<button class="back" data-a="fback">${t("← Orqaga")}</button>
    <div class="card hero"><div class="label">${t("Ro'yxatdan o'tish")}</div><div class="title">${esc(gTitle(g))}</div>${metaHtml(g)}</div>
    <div class="card">
      <div class="field-l" style="margin-top:0">${t("Sizda jamoa bormi yoki yakka o'zingizmisiz?")}</div>
      <div class="opts">
        <button class="opt ${f.type === 'team' ? 'on' : ''}" data-a="type" data-id="team"><span class="ic">👥</span><b>${t("Jamoam bor")}</b><small>${t('{n} kishilik jamoa', { n: TEAM_SIZE })}</small></button>
        <button class="opt ${f.type === 'solo' ? 'on' : ''}" data-a="type" data-id="solo"><span class="ic">🙋</span><b>${t("Yakka o'zim")}</b><small>${t("Jamoasiz yozilaman")}</small></button>
      </div>
      ${fields}
      ${over ? `<div class="note" style="margin-top:12px">${t("Hozir joy yetarli emas. Siz navbat ro'yxatiga yozilasiz.")}</div>` : ''}
      ${f.type ? `<button class="btn" data-a="confirm">${t("Tasdiqlash")}</button>` : ''}
    </div>`;
}
