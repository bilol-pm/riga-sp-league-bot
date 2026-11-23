/* Formalarni yuborish: ro'yxatdan o'tish va admin o'yin formasi (tekshirish + serverga yuborish). */

async function submitForm() {
  const f = state.form;
  let body;
  if (f.type === 'solo') {
    if (f.name.trim().length < 2) return toast(t("Ismingizni kiriting"));
    if (!okPhone(f.phone)) return toast(t("Telefon raqamni to'g'ri kiriting"));
    if (!okEmail(f.email)) return toast(t("Email manzilni to'g'ri kiriting"));
    body = { gameId: f.gameId, kind: 'solo', name: f.name, phone: f.phone, email: f.email };
  } else if (f.type === 'team') {
    if (f.members.some(s => s.trim().length < 2)) return toast(t("{n} ta o'yinchining hammasini kiriting", { n: TEAM_SIZE }));
    if (!okPhone(f.phone)) return toast(t("Kapitanning telefon raqamini kiriting"));
    body = { gameId: f.gameId, kind: 'team', teamName: f.teamName, members: f.members, captain: f.captain, phone: f.phone };
  } else return toast(t("Avval tanlang: jamoa yoki yakka"));
  if (!(await act('/api/register', body))) return;
  const g = byId(f.gameId), wait = g && statusOf(g) === 'wait';
  state.form = null; state.open = null; state.tab = 'mine';
  render(); window.scrollTo(0, 0);
  toast(wait ? t('Navbatga yozildingiz') : t('Muvaffaqiyatli yozildingiz ✅'));
}

function openAdminForm(g, dateStr) {
  if (g) {
    state.aform = { id: g.id, date: ymd(new Date(g.ts)), time: fmtTime(g.ts), place: g.place, mapUrl: g.mapUrl, capacity: String(g.capacity), title: g.title === "Futbol o'yini" ? '' : g.title };
  } else {
    const last = [...state.games].sort((a, b) => b.ts - a.ts)[0];   // oxirgi o'yin ma'lumotlarini nusxalaymiz
    state.aform = { id: null, date: dateStr || ymd(nextSaturday()), time: last ? fmtTime(last.ts) : '20:00',
      place: last ? last.place : '', mapUrl: last ? last.mapUrl : '', capacity: String(last ? last.capacity : TEAM_SIZE * 4), title: '' };
  }
  render(); window.scrollTo(0, 0);
}

async function saveAdminForm() {
  const f = state.aform;
  if (!f.date || !f.time) return toast(t("Sana va vaqtni kiriting"));
  const [y, m, d] = f.date.split('-').map(Number), [hh, mm] = f.time.split(':').map(Number);
  const ts = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  if (!Number.isFinite(ts)) return toast(t("Sana yoki vaqt noto'g'ri"));
  if (!f.id && ts <= Date.now()) return toast(t("Bu sana o'tib ketgan"));
  const cap = parseInt(f.capacity, 10);
  if (!(cap >= 1 && cap <= 200)) return toast(t("O'rinlar soni 1 dan 200 gacha bo'lsin"));
  const ok = await act('/api/admin/game', { id: f.id, ts, title: f.title, place: f.place, mapUrl: f.mapUrl, capacity: cap },
    f.id ? t('Saqlandi ✅') : t("O'yin qo'shildi ✅"));
  if (ok) { state.aform = null; render(); window.scrollTo(0, 0); }
}
