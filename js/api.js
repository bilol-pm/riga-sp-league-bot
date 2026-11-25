/* Server (Cloudflare Worker) bilan aloqa: api() so'rov yuboradi, refresh() holatni yangilaydi, act() amal bajaradi. */

/* ---------- Server bilan aloqa ---------- */
async function api(path, body) {
  if (!API_BASE) throw new Error(t('Server manzili sozlanmagan'));
  const opts = { headers: {} };
  if (INIT) opts.headers['X-Init-Data'] = INIT;
  if (body !== undefined) {
    opts.method = 'POST';
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let r, j = null;
  try { r = await fetch(API_BASE + path, opts); }
  catch (e) { throw new Error(t("Server bilan aloqa yo'q. Internetni tekshiring.")); }
  try { j = await r.json(); } catch (e) {}
  if (!r.ok || !j || j.ok === false) {
    const blocked = j && j.until > Date.now();   // bloklangan odam ro'yxatdan o'tmoqchi bo'ldi
    const err = new Error(blocked ? t("Siz vaqtincha bloklangansiz. Ro'yxatdan o'tish mumkin: {when} dan keyin", { when: fmtWhen(j.until) }) : (j && j.error ? srvErr(j.error) : t('Xatolik yuz berdi')));
    err.status = r.status; err.blocked = blocked;
    throw err;
  }
  return j;
}
let rev = 0;   // har bir yangi holat olinganda oshadi: eskirgan javob yangisini bosib ketmasin
function applyState(s) {
  rev++;
  state.me = s.me; state.games = s.games; state.admins = s.admins || []; state.blocks = s.blocks || [];
  state.loaded = true; state.error = '';
  syncHist();
}
const isEditing = () => !!(state.form || state.aform || state.pform) ||
  !!(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
async function refresh(silent) {
  const my = rev;
  try { const r = await api('/api/state'); if (rev !== my) return; applyState(r.state); }
  catch (e) {
    if (!state.loaded) state.error = e.message;
    else if (!silent) toast(e.message);
    else return;
  }
  if (silent && isEditing()) return;   // yozayotgan paytda ekranni buzmaymiz
  render();
}
// O'zgartiruvchi amal: serverga yuboradi, javobdagi yangi holatni oladi
async function act(path, body, okMsg) {
  if (state.busy) return false;
  state.busy = true;
  try {
    const r = await api(path, body); applyState(r.state);
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    toast(e.message || t('Xatolik'));
    if (e.blocked) refresh(false);   // blok haqidagi xabar darrov ekranda chiqsin
    return false;
  } finally { state.busy = false; }
}
