/* Qurilmada saqlanadigan ma'lumotlar (localStorage): profil sozlamalari va yozilgan o'yinlar tarixi. */

const PROF_KEY = 'rsp_profile_' + (tu ? tu.id : 'guest');
function loadProf() {
  try { const o = JSON.parse(localStorage.getItem(PROF_KEY) || '{}'); return { name: o.name || '', phone: o.phone || '', email: o.email || '' }; }
  catch (e) { return { name: '', phone: '', email: '' }; }
}
function saveProf(o) { try { localStorage.setItem(PROF_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
/* Yozilgan o'yinlar tarixi: serverda ko'rinmay qolgan eski o'yinlar ham shu qurilmada saqlanadi */
const HIST_KEY = 'rsp_hist_' + (tu ? tu.id : 'guest');
function loadHist() { try { const a = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function saveHist(a) { try { localStorage.setItem(HIST_KEY, JSON.stringify(a.slice(0, 300))); } catch (e) {} }
function syncHist() {
  if (!state.me || !tu) return;
  const h = loadHist(), ids = new Set(state.games.map(g => g.id));
  const cut = Date.now() - 8 * 86400000;                 // server shundan eski o'yinlarni qaytarmaydi
  const out = h.filter(x => !ids.has(x.id) && x.ts < cut);   // faqat eskirgan o'yinlar saqlanadi; adminlar o'chirganlari yo'qoladi
  state.games.forEach(g => {
    const p = g.players.find(q => q.mine); if (!p) return;  // bekor qilingan bo'lsa tarixdan chiqadi
    out.push({ id: g.id, ts: g.ts, title: g.title, place: g.place, mapUrl: g.mapUrl, kind: p.kind, name: p.name, members: p.members || [], captain: p.captain, waiting: !!p.waiting });
  });
  saveHist(out);
}
const profile = loadProf();                              // Profil sozlamalari (shu qurilmada saqlanadi)
const shownName = () => profile.name || MY_NAME;
const nick = () => profile.name ? profile.name : (tu ? (tu.username ? '@' + tu.username : MY_NAME) : '');
