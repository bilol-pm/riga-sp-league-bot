/* Chizish: render() hozirgi holatga qarab to'g'ri sahifani chizadi; toast (xabar), ask (tasdiqlash), tick (teskari sanoq). */

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');

function render() {
  if (state.tab === 'admin') state.tab = 'profile';
  let html;
  if (!state.loaded) html = viewBoot();
  else if (state.aform) html = viewAdminForm();
  else if (state.form) html = viewForm();
  else if (state.tab === 'games') html = state.open ? viewDetail() : viewGames();
  else if (state.tab === 'mine') html = state.open ? viewDetail() : viewMine();
  else if (state.tab === 'profile') html = state.open ? (byId(state.open) ? viewDetail() : viewHistGame()) : viewProfile();
  else html = viewProfile();
  $app.innerHTML = html;
  const tabs = [['games', '⚽', t('Asosiy')], ['mine', '📝', t('Yozilganlar')], ['profile', '👤', t('Profil')]];
  $nav.innerHTML = tabs.map(x => `<button data-a="tab" data-id="${x[0]}" class="${state.tab === x[0] ? 'on' : ''}"><span>${x[1]}</span>${x[2]}</button>`).join('');
  tick();
}

function toast(m) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = m;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
}
const canConfirm = tg && tg.showConfirm && (!tg.isVersionAtLeast || tg.isVersionAtLeast('6.2'));
function ask(msg, yes) {
  if (canConfirm) tg.showConfirm(msg, ok => { if (ok) yes(); });
  else if (window.confirm(msg)) yes();
}

/* ---------- Teskari sanoq ---------- */
function tick() {
  const el = document.getElementById('cd');
  if (!el) return;
  const ts = +el.dataset.ts;
  if (ts <= Date.now()) { render(); return; }   // o'yin boshlandi: asosiy karta keyingi o'yinga o'tadi
  let s = Math.floor((ts - Date.now()) / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const v = [[d, t('kun')], [h, t('soat')], [m, t('daqiqa')], [s, t('soniya')]];
  el.innerHTML = v.map(x => `<div><b>${pad(x[0])}</b><small>${x[1]}</small></div>`).join('');
}
setInterval(tick, 1000);
