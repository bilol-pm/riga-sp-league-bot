/* "Yozilganlar" sahifasi: admin uchun o'yin kartochkalari, oddiy o'yinchi uchun o'z yozuvlari. */

/* Yozilgan o'yinlar */
/* Admin uchun Yozilganlar: o'yin sanalari kartochkalari (ko'p bo'lsa eng yaqin 3 tasi) */
function viewMineAdmin() {
  const up = upcoming(), many = up.length > 10;
  const list = many && !state.allGames ? up.slice(0, 3) : up;
  const cards = list.map(g => {
    const d = new Date(g.ts), tc = gameCount(g, 'team'), so = gameCount(g, 'solo');
    return `<div class="card link" data-a="open" data-id="${g.id}"><div class="row">
      <div class="datebox"><b>${d.getDate()}</b><small>${monShort(d.getMonth())}</small></div>
      <div class="grow"><div class="g-title">${dayName(d.getDay())}, ${fmtTime(g.ts)}</div>
        <div class="g-sub">📍 ${g.place ? esc(g.place) : t('Joy kiritilmagan')}</div>
        <div class="g-sub">${t("{a}/{b} o'yinchi", { a: g.used, b: g.capacity })} · ${t('{n} jamoa', { n: tc })} · ${t('{n} yakka', { n: so })}${g.waiting ? ` · ${t('{n} kishi navbatda', { n: g.waiting })}` : ''}</div></div>
      <div class="chev">›</div></div></div>`;
  }).join('');
  const toggle = many ? `<button class="btn ghost" data-a="allgames">${state.allGames ? t("Faqat eng yaqin 3 tasini ko'rsatish") : t("Hammasini ko'rish ({n})", { n: up.length })}</button>` : '';
  const sub = many && !state.allGames ? `<div class="g-sub" style="margin:-6px 2px 12px">${t("Eng yaqin 3 ta o'yin")}</div>` : '';
  return topHtml() + `<h3 style="margin-top:4px">${t('Yozilganlar')}</h3>${sub}` +
    (cards || `<div class="empty"><div class="big">📅</div>${t("Hali o'yinlar yo'q.")}</div>`) + toggle;
}
function viewMine() {
  if (isAdmin()) return viewMineAdmin();
  const mine = upcoming().filter(isReg);
  const body = mine.length ? mine.map(g => {
    const d = new Date(g.ts), p = myReg(g);
    const who = p.kind === 'team'
      ? `<div class="g-sub">👥 ${esc(p.name)} · ${t('{n} kishi', { n: p.members.length })}</div><div class="g-sub">⭐ ${t('Kapitan: {name}', { name: esc(p.members[p.captain] || '—') })}</div>`
      : `<div class="g-sub">🙋 ${esc(p.name)} · ${t('yakka')}</div>`;
    return `<div class="card"><div class="row">
      <div class="datebox"><b>${d.getDate()}</b><small>${monShort(d.getMonth())}</small></div>
      <div class="grow"><div class="g-title">${dayName(d.getDay())}, ${fmtTime(g.ts)}</div>
        <div class="g-sub">📍 ${g.place ? esc(g.place) : t("Joy keyin e'lon qilinadi")}</div>${who}</div>
      ${badge(g)}</div>
      <div class="btnrow">
        <button class="btn ghost sm" data-a="open" data-id="${g.id}">${t("Ro'yxatni ko'rish")}</button>
        <button class="btn out sm" data-a="cancel" data-id="${g.id}">${t("Bekor qilish")}</button>
      </div></div>`;
  }).join('') : `<div class="empty"><div class="big">📝</div>${t("Siz hali hech qaysi o'yinga yozilmagansiz.")}</div>`;
  return topHtml() + `<h3 style="margin-top:4px">${t("Yozilgan o'yinlar")}</h3>` + body;
}
