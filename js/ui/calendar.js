/* Hafta kalendari: hafta bo'yicha o'yinlar, oldinga/orqaga o'tish. */

/* ---------- Hafta va kalendar ---------- */
const weekStart = () => { const d = mondayOf(Date.now()); d.setDate(d.getDate() + state.week * 7); return d; };
function weekGames() {
  const s = weekStart(), e = new Date(s); e.setDate(e.getDate() + 7);
  return state.games.filter(g => g.ts >= s.getTime() && g.ts < e.getTime()).sort((a, b) => a.ts - b.ts);
}
function weekNav() {
  const s = weekStart(), e = new Date(s); e.setDate(e.getDate() + 6);
  const sm = s.getMonth(), em = e.getMonth();
  const range = sm === em
    ? (LANG === 'en' ? `${MONTHS_L.en[sm]} ${s.getDate()}–${e.getDate()}` : `${s.getDate()}–${dm(e.getDate(), em)}`)
    : `${dm(s.getDate(), sm)} – ${dm(e.getDate(), em)}`;
  const name = state.week === 0 ? t('Shu hafta') : state.week === 1 ? t('Keyingi hafta') : t('{n} hafta keyin', { n: state.week });
  return `<div class="cal-h"><button data-a="wk" data-id="-1" ${state.week <= 0 ? 'disabled' : ''}>‹</button>
    <div style="text-align:center"><b>${name}</b><div class="g-sub" style="margin:2px 0 0">${range}</div></div>
    <button data-a="wk" data-id="1" ${state.week >= MAX_WEEKS ? 'disabled' : ''}>›</button></div>`;
}
function calendarHtml() {
  const s = weekStart(), now = new Date(), gs = weekGames(), adm = isAdmin();
  let cells = weekdays().map(w => `<div class="cal-w">${w}</div>`).join('');
  for (let i = 0; i < 7; i++) {
    const d = new Date(s); d.setDate(d.getDate() + i);
    const g = gs.find(x => new Date(x.ts).toDateString() === d.toDateString());
    const today = d.toDateString() === now.toDateString();
    const notPast = d.getTime() + 86400000 > now.getTime();
    const cls = 'cal-d' + (today ? ' today' : '') + (g ? (isReg(g) ? ' game reg' : ' game') : '');
    if (g) cells += `<div class="${cls}" data-a="open" data-id="${g.id}">${d.getDate()}</div>`;
    else if (adm && notPast) cells += `<div class="${cls} add" data-a="newgame" data-id="${ymd(d)}">${d.getDate()}</div>`;
    else cells += `<div class="${cls}">${d.getDate()}</div>`;
  }
  return `<h3>${t("Kalendar")}</h3><div class="card">
    ${weekNav()}
    <div class="cal-g">${cells}</div>
    <div class="legend"><span><i style="background:#52222f"></i>${t("O'yin kuni")}</span><span><i style="background:#14532d"></i>${t("Siz yozilgansiz")}</span><span><i style="border:1px solid var(--blue)"></i>${t("Bugun")}</span></div>
    ${adm ? `<div class="hint">${t("Admin: bo'sh kunni bossangiz, shu kunga yangi o'yin qo'shiladi.")}</div>` : ''}
  </div>`;
}
