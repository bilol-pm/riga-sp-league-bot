/* Hodisalar: kiritish maydonlari va barcha tugmalar (data-a="..." bo'yicha). Yangi tugma qo'shsangiz shu yerga qator qo'shing. */

document.addEventListener('input', e => {
  const d = e.target.dataset || {};
  let v = e.target.value;
  if (d.f === 'phone' || d.pf === 'phone') { e.target.value = localDigits(v); v = fullPhone(v); }   // faqat 8 ta raqam; +371 oldindan qo'yilgan
  if (d.f && state.form) {
    if (/^m\d$/.test(d.f)) state.form.members[+d.f.slice(1)] = v; else state.form[d.f] = v;
  } else if (d.af && state.aform) state.aform[d.af] = v;
  else if (d.na) state.newAdmin[d.na] = v;
  else if (d.pf && state.pform) state.pform[d.pf] = v;
});

document.addEventListener('click', async e => {
  if (state.langOpen && !e.target.closest('.langbox')) { state.langOpen = false; render(); }   // menyudan tashqariga bosilsa yopiladi
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  const a = el.dataset.a, id = el.dataset.id;
  haptic();
  if (a === 'lang') { state.langOpen = !state.langOpen; render(); }
  else if (a === 'setlang') { state.langOpen = false; setLang(id); render(); }
  else if (a === 'tab') { state.langOpen = false; state.tab = id; state.open = null; state.adminView = null; state.profView = null; state.pform = null; state.form = null; state.aform = null; render(); window.scrollTo(0, 0); }
  else if (a === 'open') { state.open = +id; render(); window.scrollTo(0, 0); }
  else if (a === 'back') { state.open = null; render(); }
  else if (a === 'allgames') { state.allGames = !state.allGames; render(); }
  else if (a === 'pgame') { state.open = +id; render(); window.scrollTo(0, 0); }
  else if (a === 'pedit') { state.profView = 'edit'; state.pform = { name: profile.name, phone: profile.phone, email: profile.email }; render(); window.scrollTo(0, 0); }
  else if (a === 'pback') { state.profView = null; state.pform = null; render(); }
  else if (a === 'psave') {
    const f = state.pform, name = f.name.trim(), phone = fullPhone(f.phone), email = f.email.trim();
    if (name && name.length < 2) return toast(t("Ism juda qisqa"));
    if (phone && !okPhone(phone)) return toast(t(PHONE_ERR));
    const em = email && emailError(email); if (em) return toast(em);
    Object.assign(profile, { name, phone, email });
    if (!saveProf(profile)) return toast(t("Saqlab bo'lmadi"));
    state.profView = null; state.pform = null; render(); toast(t('Saqlandi ✅'));
  }
  else if (a === 'pclear') { Object.assign(profile, { name: '', phone: '', email: '' }); saveProf(profile); state.pform = { name: '', phone: '', email: '' }; render(); toast(t('Tozalandi')); }
  else if (a === 'copyid') {
    const txt = String(tu.id);
    try { navigator.clipboard.writeText(txt).then(() => toast(t('ID nusxalandi')), () => toast('ID: ' + txt)); } catch (e) { toast('ID: ' + txt); }
  }
  else if (a === 'adm') { state.adminView = id; render(); window.scrollTo(0, 0); }
  else if (a === 'admback') { state.adminView = null; render(); window.scrollTo(0, 0); }
  else if (a === 'retry') { state.error = ''; render(); refresh(false); }
  else if (a === 'map') { const g = byId(+id) || loadHist().find(h => h.id === +id); if (g && g.mapUrl) { if (tg && tg.openLink) tg.openLink(g.mapUrl); else window.open(g.mapUrl, '_blank', 'noopener'); } }
  else if (a === 'wk') { state.week = Math.min(MAX_WEEKS, Math.max(0, state.week + +id)); render(); }
  else if (a === 'reg') {
    if (!state.me) return toast(t("Telegram ichida oching, shunda ro'yxatdan o'tish mumkin"));
    state.form = { gameId: +id, type: null, name: shownName(), phone: profile.phone, email: profile.email, teamName: '', members: Array(TEAM_SIZE).fill(''), captain: 0 };
    render(); window.scrollTo(0, 0);
  }
  else if (a === 'fback') { state.form = null; render(); }
  else if (a === 'type') { state.form.type = id; if (id === 'team' && !state.form.members[0].trim()) state.form.members[0] = shownName(); render(); }
  else if (a === 'cap') { state.form.captain = +id; render(); }
  else if (a === 'confirm') await submitForm();
  else if (a === 'cancel') { if (await act('/api/cancel', { gameId: +id }, t("Ro'yxatdan chiqdingiz"))) render(); }
  /* admin */
  else if (a === 'newgame') openAdminForm(null, id || null);
  else if (a === 'editgame') { const g = byId(+id); if (g) openAdminForm(g); }
  else if (a === 'aback') { state.aform = null; render(); }
  else if (a === 'asave') await saveAdminForm();
  else if (a === 'delgame') ask(t("Bu o'yinni va unga yozilganlarning hammasini o'chirasizmi?"), async () => {
    if (await act('/api/admin/game/delete', { id: +id }, t("O'yin o'chirildi"))) { if (state.open === +id) state.open = null; render(); }
  });
  else if (a === 'delreg') ask(t("Bu yozuvni ro'yxatdan o'chirasizmi?"), async () => {
    if (await act('/api/admin/reg/delete', { id: +id }, t("Yozuv o'chirildi"))) render();
  });
  else if (a === 'att') {   // admin: o'tgan o'yinda "keldi" / "kelmadi" belgilash (shu tugmani yana bossa, belgi olib tashlanadi)
    const p = regById(+id); if (!p) return;
    const st = el.dataset.st, cur = p.attended;
    const next = (st === 'came' && cur === 1) || (st === 'absent' && cur === 0) ? 'clear' : st;
    const msg = { came: t("«Keldi» deb belgilandi"), absent: t("«Kelmadi» deb belgilandi"), clear: t('Belgi olib tashlandi') }[next];
    const go = async () => { if (await act('/api/admin/attendance', { id: +id, status: next }, msg)) render(); };
    if (next === 'absent') ask((p.strikes || 0) + 1 >= STRIKES_TO_BLOCK
      ? t("Bu o'yinchi ikkinchi marta kelmadi. Akkaunt 1 haftaga bloklanadi. Davom etasizmi?")
      : t("«Kelmadi» deb belgilaysizmi? O'yinchiga ogohlantirish xabari yuboriladi."), go);
    else go();
  }
  else if (a === 'unblock') ask(t("Blokni olib tashlaysizmi?"), async () => {
    if (await act('/api/admin/unblock', { id: +id }, t('Blok olib tashlandi'))) render();
  });
  else if (a === 'addadmin') {
    const uid = state.newAdmin.uid.trim();
    if (!/^\d{5,15}$/.test(uid)) return toast(t("Telegram ID faqat raqamlardan iborat bo'lsin"));
    if (await act('/api/admin/admins/add', { uid: Number(uid), name: state.newAdmin.name }, t("Admin qo'shildi ✅"))) { state.newAdmin = { uid: '', name: '' }; render(); }
  }
  else if (a === 'rmadmin') ask(t("Bu adminni o'chirasizmi?"), async () => {
    if (await act('/api/admin/admins/remove', { uid: Number(id) }, t("Admin o'chirildi"))) render();
  });
});
