/* O'yin ichi: o'yinchi qatori, admin uchun statistika va ro'yxat (jamoalar, keyin yakkalar). */

/* O'yinchi qatori (telefon va email faqat adminga) */
function playerRow(p, i, adm, g) {
  const wait = p.waiting ? `<span class="tag wait">${t("Navbatda")}</span>` : '';
  const past = adm && g && g.ts <= Date.now();
  // Admin: "kelmadi" belgisi soni (⚠️ 1) va bloklangan bo'lsa belgi
  const flags = adm ? (p.strikes ? ` <span class="tag wait" title="${t("Kelmagan o'yinlar")}">⚠️ ${p.strikes}</span>` : '') + (p.blockedUntil ? ` <span class="tag full">⛔ ${t('Bloklangan')}</span>` : '') : '';
  // Admin: o'tgan o'yinda keldi/kelmadi tugmalari (navbatdagilar uchun yo'q)
  const att = past && !p.waiting ? `<div class="att"><button class="abtn ok ${p.attended === 1 ? 'on' : ''}" data-a="att" data-id="${p.id}" data-st="came">✓ ${t('Keldi')}</button>
    <button class="abtn no ${p.attended === 0 ? 'on' : ''}" data-a="att" data-id="${p.id}" data-st="absent">✗ ${t('Kelmadi')}</button></div>` : '';
  const x = adm ? `<button class="xbtn" data-a="delreg" data-id="${p.id}" aria-label="${t("O'chirish")}">✖</button>` : '';
  const contact = adm ? `<div class="contact">📞 ${esc(p.phone || '')}${p.email ? ' · ✉️ ' + esc(p.email) : ''}${p.username ? ' · @' + esc(p.username) : ''}</div>` : '';
  if (p.kind === 'team') {
    return `<div class="player"><div class="num">${i + 1}</div><div class="pav">👥</div>
      <div class="grow"><div class="${p.mine ? 'me' : ''}">${esc(p.name)} · ${t('{n} kishi', { n: p.members.length })}${p.mine ? ' ' + t('(siz)') : ''}${flags}</div>
      <div class="g-sub">⭐ ${t('Kapitan: {name}', { name: esc(p.members[p.captain] || '—') })}</div>
      <div class="g-sub">${esc(p.members.join(', '))}</div>${contact}${att}</div>${wait}${x}</div>`;
  }
  return `<div class="player"><div class="num">${i + 1}</div><div class="pav">${esc(initial(p.name))}</div>
    <div class="grow"><div class="${p.mine ? 'me' : ''}">${esc(p.name)}${p.mine ? ' ' + t('(siz)') : ''}${flags}</div>
    <div class="g-sub">${t("Yakka o'yinchi")}</div>${contact}${att}</div>${wait}${x}</div>`;
}

/* Bitta o'yin statistikasi (admin uchun) */
function gameTiles(g) {
  const n = k => g.players.filter(p => p.kind === k).length;
  return `<div class="stats3" style="margin-top:12px">
    <div class="stat"><b>${g.used}/${g.capacity}</b><small>${t("O'yinchilar")}</small></div>
    <div class="stat"><b>${freeOf(g)}</b><small>${t("Bo'sh joy")}</small></div>
    <div class="stat"><b>${g.waiting}</b><small>${t("Navbatda")}</small></div>
    <div class="stat"><b>${n('team')}</b><small>${t("Jamoalar")}</small></div>
    <div class="stat"><b>${n('solo')}</b><small>${t("Yakkalar")}</small></div>
    <div class="stat"><b>${g.players.length}</b><small>${t("Yozuvlar")}</small></div></div>`;
}

/* O'yin ichi: ma'lumot + ro'yxat */
function viewDetail() {
  const g = byId(state.open);
  if (!g) { state.open = null; return viewGames(); }
  const adm = isAdmin();
  // Oddiy o'yinchi faqat o'z yozuvini ko'radi; boshqalar ro'yxati faqat adminga
  const mineP = myReg(g);
  const teams = g.players.filter(p => p.kind === 'team'), solos = g.players.filter(p => p.kind === 'solo');
  const grp = (title, arr) => arr.length ? `<h3>${title} (${arr.length})</h3><div class="card">${arr.map((p, i) => playerRow(p, i, true, g)).join('')}</div>` : '';
  const body = adm
    ? gameTiles(g) + (g.players.length ? grp('👥 ' + t('Jamoalar'), teams) + grp('🙋 ' + t("Yakka o'yinchilar"), solos)
        : `<div class="empty"><div class="big">🙌</div>${t("Hali hech kim yozilmagan.")}</div>`)
    : `<h3>${t("Mening yozuvim")}</h3><div class="card">${mineP ? whoHtml(mineP) : `<div class="g-sub">${t("Siz hali bu o'yinga yozilmagansiz.")}</div>`}</div>`;
  const top = adm
    ? `<div class="g-title" style="font-size:19px;margin:2px 2px 4px">${fmtDate(g.ts)}, ${fmtTime(g.ts)}</div><div class="g-sub" style="margin:0 2px 4px">📍 ${placeHtml(g)}</div>`
    : `<div class="card hero"><div class="label">${t("O'yin")}</div><div class="title">${esc(gTitle(g))}</div>
      ${metaHtml(g)}${progress(g)}${actionBtn(g)}</div>`;
  return `<button class="back" data-a="back">${t("← Orqaga")}</button>${top}${body}`;
}
