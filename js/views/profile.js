/* "Profil" sahifasi: ism/rol, sozlamalar, yozilgan o'yinlarim tarixi, ma'lumotlarimni tahrirlash. */

function viewProfile() {
  if (state.profView === 'edit') return viewProfileEdit();
  const sub = adminSub(); if (sub) return sub;
  const role = isOwner() ? `<span class="tag ok">${t('Asoschi')}</span>` : (isAdmin() ? `<span class="tag ok">${t('Admin')}</span>` : '');
  // Adminlarga "yozilgan o'yinlar" ko'rsatilmaydi, faqat oddiy o'yinchilarga
  const stats = isAdmin() ? '' : `<div class="stats" style="margin-bottom:16px"><div class="stat"><b>${state.games.filter(isReg).length}</b><small>${t("Yozilgan o'yinlar")}</small></div>
    <div class="stat"><b>${upcoming().filter(isReg).length}</b><small>${t("Kutilayotgan")}</small></div></div>`;
  const rows = li('✏️', t("Mening ma'lumotlarim"), profile.name || profile.phone || profile.email ? [profile.name, profile.phone].filter(Boolean).join(' · ') : t('Ism, telefon, email'), 'pedit') +
    (tu ? li('🆔', 'Telegram ID', t('{id} · nusxalash uchun bosing', { id: tu.id }), 'copyid') : '');
  return topHtml() + blockNote() + `<div class="card"><div class="row">${avatarHtml()}<div class="grow"><div class="g-title">${esc(shownName() || t('Foydalanuvchi'))}</div>
    <div class="g-sub">${tu && tu.username ? '@' + esc(tu.username) : t("username yo'q")}</div>
    ${tu ? `<div class="g-sub">Telegram ID: <b>${tu.id}</b></div>` : ''}</div>${role}</div></div>
    ${stats}<div class="sec-l">${t('Sozlamalar')}</div><div class="menu">${rows}</div>${isAdmin() ? adminMenu() : myGamesHtml()}`;
}

/* Profilda: men yozilgan barcha o'yinlar (yangisi tepada) */
function myGamesHtml() {
  const h = loadHist().sort((a, b) => b.ts - a.ts);
  const head = `<div class="sec-h" style="margin-top:6px"><div class="sec-l" style="margin:0">${t("Yozilgan o'yinlarim")}</div><span class="g-sub" style="margin:0">${t('{n} ta', { n: h.length })}</span></div>`;
  if (!h.length) return head + `<div class="card"><div class="g-sub">${t("Hali hech qaysi o'yinga yozilmagansiz.")}</div></div>`;
  return head + `<div class="menu">` + h.map(x => {
    const d = new Date(x.ts), past = x.ts <= Date.now();
    const tag = past ? `<span class="tag full">${t("O'tgan")}</span>` : (x.waiting ? `<span class="tag wait">${t("Navbatda")}</span>` : `<span class="tag ok">${t("Yozildingiz")}</span>`);
    return `<div class="li" data-a="pgame" data-id="${x.id}"><div class="datebox"><b>${d.getDate()}</b><small>${monShort(d.getMonth())}</small></div>
      <div class="grow"><div class="li-t">${dayName(d.getDay())}, ${fmtTime(x.ts)}</div><div class="li-s">📍 ${x.place ? esc(x.place) : t("Joy e'lon qilinmagan")}</div></div>${tag}<div class="chev">›</div></div>`;
  }).join('') + `</div>`;
}
/* Mening yozuvim: jamoa/yakka, kapitan, o'yinchilar */
function whoHtml(x) {
  return x.kind === 'team'
    ? `<div class="g-title">👥 ${esc(x.name)}</div><div class="g-sub">⭐ ${t('Kapitan: {name}', { name: esc(x.members[x.captain] || '—') })}</div><div class="g-sub">${esc(x.members.join(', '))}</div>`
    : `<div class="g-title">🙋 ${esc(x.name)}</div><div class="g-sub">${t("Yakka o'yinchi")}</div>`;
}
/* Eski (serverda endi ko'rinmaydigan) o'yin tafsiloti: sana, vaqt, joy va mening yozuvim */
function viewHistGame() {
  const x = loadHist().find(h => h.id === state.open);
  if (!x) { state.open = null; return viewProfile(); }
  const past = x.ts <= Date.now();
  const tag = past ? `<span class="tag full">${t("O'tgan")}</span>` : (x.waiting ? `<span class="tag wait">${t("Navbatda")}</span>` : `<span class="tag ok">${t("Yozildingiz")}</span>`);
  const who = whoHtml(x);
  return `<button class="back" data-a="back">${t("← Orqaga")}</button>
    <div class="card hero"><div class="label">${t("O'yin")}</div><div class="title">${esc(gTitle(x))}</div>${metaHtml(x)}<div>${tag}</div></div>
    <h3>${t("Mening yozuvim")}</h3><div class="card">${who}</div>`;
}

function viewProfileEdit() {
  const f = state.pform;
  return `<button class="back" data-a="pback">${t("← Orqaga")}</button>
    <div class="card"><div class="g-title">${t("Mening ma'lumotlarim")}</div>
      <div class="hint">${t("Bu ma'lumotlar ro'yxatdan o'tish formasida avtomatik to'ldiriladi. Ular shu qurilmada saqlanadi.")}</div>
      <div class="field-l">${t("Ism")}</div>
      <input type="text" data-pf="name" maxlength="40" placeholder="${esc(MY_NAME || t('Ismingiz'))}" value="${esc(f.name)}">
      <div class="field-l">${t("Telefon raqam")}</div>
      ${phoneInput('data-pf="phone"', f.phone)}
      <div class="field-l">Email</div>
      <input type="email" data-pf="email" maxlength="80" placeholder="email@example.com" value="${esc(f.email)}">
      <button class="btn" data-a="psave">${t("Saqlash")}</button>
      <button class="btn ghost" data-a="pclear">${t("Tozalash")}</button>
    </div>`;
}
