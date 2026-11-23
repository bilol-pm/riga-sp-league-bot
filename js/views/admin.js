/* Admin bo'limi (Profil ichida): menyu, o'yinlar, yozilganlar, statistika, adminlar. */

/* Admin panel: menyu ro'yxati (har bir bo'lim alohida sahifa) */
const li = (ic, t, s, a, id) => `<div class="li" data-a="${a}" data-id="${id || ''}"><div class="li-ic">${ic}</div>
  <div class="grow"><div class="li-t">${t}</div><div class="li-s">${s}</div></div><div class="chev">›</div></div>`;
const admHead = title => `<button class="back" data-a="admback">${t("← Orqaga")}</button><h3 style="margin-top:0">${title}</h3>`;
const gameCount = (g, k) => g.players.filter(p => p.kind === k).length;

/* Admin bo'limi profilning ichida: ichki sahifalar (null = menyu ko'rsatiladi) */
function adminSub() {
  if (!isAdmin()) return null;
  const v = state.adminView;
  if (v === 'games') return viewAdmGames();
  if (v === 'players') return viewAdmPlayers();
  if (v === 'stats') return viewAdmStats();
  if (v === 'admins' && isOwner()) return viewAdmAdmins();
  return null;
}
function adminMenu() {
  const up = upcoming();
  const regs = up.reduce((a, g) => a + g.players.length, 0), people = up.reduce((a, g) => a + g.used, 0);
  const g1 = li('➕', t("Yangi o'yin qo'shish"), t("Sana, vaqt, joy va sig'im"), 'newgame') +
    li('🗓', t("O'yinlar"), up.length ? t('{n} ta rejalashtirilgan', { n: up.length }) : t("Hali o'yin yo'q"), 'adm', 'games') +
    li('👥', t("Ro'yxatdan o'tganlar"), regs ? t("{a} ta yozuv · {b} o'yinchi", { a: regs, b: people }) : t('Hali hech kim yozilmagan'), 'adm', 'players') +
    li('📊', t('Statistika'), t("Bo'sh joylar, jamoalar, navbat"), 'adm', 'stats');
  const g2 = isOwner() ? `<div class="sec-l">${t('Boshqaruv')}</div><div class="menu">` +
    li('🛡', t('Adminlar'), state.admins.length ? t('{n} ta admin', { n: state.admins.length }) : t('Faqat siz (asoschi)'), 'adm', 'admins') + `</div>` : '';
  return `<div class="sec-l">${t('Admin')}</div><div class="menu">${g1}</div>${g2}`;
}

function viewAdmGames() {
  const up = upcoming();
  const list = up.length ? up.map(g => {
    const d = new Date(g.ts);
    return `<div class="card"><div class="row">
      <div class="datebox"><b>${d.getDate()}</b><small>${monShort(d.getMonth())}</small></div>
      <div class="grow"><div class="g-title">${dayName(d.getDay())}, ${fmtTime(g.ts)}</div>
        <div class="g-sub">📍 ${g.place ? esc(g.place) : t('Joy kiritilmagan')}</div>
        <div class="g-sub">${t("{a}/{b} o'yinchi", { a: g.used, b: g.capacity })} · ${t("{n} ta bo'sh joy", { n: freeOf(g) })}</div></div></div>
      <div class="btnrow">
        <button class="btn ghost sm" data-a="open" data-id="${g.id}">👥 ${t("Ro'yxat")}</button>
        <button class="btn ghost sm" data-a="editgame" data-id="${g.id}">✏️ ${t("Tahrirlash")}</button>
        <button class="btn out sm" data-a="delgame" data-id="${g.id}">🗑</button></div></div>`;
  }).join('') : `<div class="empty"><div class="big">📅</div>${t("Hali o'yin qo'shilmagan.")}</div>`;
  return admHead(t("O'yinlar")) + `<button class="btn" data-a="newgame" data-id="" style="margin:0 0 12px">${t("+ Yangi o'yin")}</button>` + list;
}

function viewAdmPlayers() {
  const up = upcoming();
  const blocks = up.map(g => `<div class="sec-h"><h3 style="font-size:15px">${fmtDate(g.ts)}, ${fmtTime(g.ts)}</h3><span class="g-sub" style="margin:0">${g.used}/${g.capacity}</span></div>
    <div class="card">${g.players.length ? g.players.map((p, i) => playerRow(p, i, true)).join('') : `<div class="g-sub">${t("Hali hech kim yozilmagan.")}</div>`}</div>`).join('');
  return admHead(t("Ro'yxatdan o'tganlar")) + (blocks || `<div class="empty"><div class="big">📅</div>${t("Hali o'yin qo'shilmagan.")}</div>`);
}

function viewAdmStats() {
  const up = upcoming();
  const sum = f => up.reduce((a, g) => a + f(g), 0);
  const tiles = `<div class="stats3">
    <div class="stat"><b>${up.length}</b><small>${t("O'yinlar")}</small></div>
    <div class="stat"><b>${sum(g => g.used)}</b><small>${t("O'yinchilar")}</small></div>
    <div class="stat"><b>${sum(g => freeOf(g))}</b><small>${t("Bo'sh joy")}</small></div>
    <div class="stat"><b>${sum(g => gameCount(g, 'team'))}</b><small>${t("Jamoalar")}</small></div>
    <div class="stat"><b>${sum(g => gameCount(g, 'solo'))}</b><small>${t("Yakkalar")}</small></div>
    <div class="stat"><b>${sum(g => g.waiting)}</b><small>${t("Navbatda")}</small></div></div>`;
  const per = up.map(g => `<div class="card"><div class="g-title">${fmtDate(g.ts)}, ${fmtTime(g.ts)}</div>${progress(g)}
    <div class="g-sub">${t('{n} jamoa', { n: gameCount(g, 'team') })} · ${t('{n} yakka', { n: gameCount(g, 'solo') })}${g.waiting ? ` · ${t('{n} kishi navbatda', { n: g.waiting })}` : ''}</div></div>`).join('');
  return admHead(t('Statistika')) + tiles + (per ? `<h3>${t("Har bir o'yin")}</h3>${per}` : '');
}

function viewAdmAdmins() {
  return admHead(t('Adminlar')) + `<div class="card">
      ${state.admins.length ? state.admins.map(a => `<div class="adm-row"><div class="grow"><div class="g-title">${esc(a.name || t('Nomsiz'))}</div><div class="g-sub">ID: ${a.uid}</div></div>
        <button class="btn out sm" data-a="rmadmin" data-id="${a.uid}">${t("O'chirish")}</button></div>`).join('') : `<div class="g-sub">${t("Hozircha adminlar yo'q. Faqat siz (asoschi) borsiz.")}</div>`}</div>
    <h3>${t("Yangi admin qo'shish")}</h3><div class="card">
      <div class="field-l" style="margin-top:0">Telegram ID</div>
      <input type="text" inputmode="numeric" data-na="uid" maxlength="15" placeholder="${t('Masalan: 123456789')}" value="${esc(state.newAdmin.uid)}">
      <div class="field-l">${t("Ismi (ixtiyoriy)")}</div>
      <input type="text" data-na="name" maxlength="60" placeholder="${t("Masalan: Do'stim")}" value="${esc(state.newAdmin.name)}">
      <div class="hint">${t("Admin bo'ladigan odam Mini App'ni ochib, Profil sahifasidagi Telegram ID raqamini sizga yuborsin.")}</div>
      <button class="btn" data-a="addadmin">${t("Admin qo'shish")}</button></div>`;
}
