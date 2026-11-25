/* Ilovaning yagona holati (state) va undan o'qiydigan qisqa yordamchilar: rol, o'yinlar, mening yozuvim. */

/* ---------- Holat ---------- */
// me: server aytadi (id, role: player | admin | owner). games: serverdagi real o'yinlar.
const state = {
  me: null, games: [], admins: [], blocks: [], loaded: false, error: '', busy: false,
  tab: 'games',        // games | mine | profile | admin
  open: null,          // ochilgan o'yin (ro'yxat)
  form: null,          // ro'yxatdan o'tish formasi
  aform: null,         // admin: o'yin qo'shish/tahrirlash formasi
  profView: null,      // profil: null | edit
  pform: null,
  allGames: false,     // admin Yozilganlar: hammasini ko'rsatish
  adminView: null,     // admin menyusi: null | games | players | stats | admins
  newAdmin: { uid: '', name: '' },
  langOpen: false,     // til tanlash menyusi
  week: 0
};
const isAdmin = () => !!state.me && (state.me.role === 'admin' || state.me.role === 'owner');
const isOwner = () => !!state.me && state.me.role === 'owner';
const upcoming = () => state.games.filter(g => g.ts > Date.now()).sort((a, b) => a.ts - b.ts);
const byId = id => state.games.find(g => g.id === id);
const regById = id => { for (const g of state.games) { const p = g.players.find(q => q.id === id); if (p) return p; } return null; };
const myReg = g => g.players.find(p => p.mine);
const isReg = g => !!myReg(g);
const statusOf = g => { const p = myReg(g); return !p ? null : (p.waiting ? 'wait' : 'ok'); };
const freeOf = g => Math.max(0, g.capacity - g.used);   // faqat admin uchun (server oddiy o'yinchiga sonlarni yubormaydi)
// Shu o'yinga size kishi sig'adimi? Server `fits` yuboradi; eski server bo'lsa o'zimiz hisoblaymiz.
const fitsGame = (g, size) => g.fits ? (size > 1 ? g.fits.team : g.fits.solo) : g.used + size <= g.capacity;
