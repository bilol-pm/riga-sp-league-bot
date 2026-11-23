/* Ishga tushirish: davriy yangilash va birinchi chizish. Eng oxirida yuklanadi. */

setInterval(() => { if (!document.hidden) refresh(true); }, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); });
document.documentElement.lang = LANG; document.title = t('Riga Street Power Liga');
render();
refresh(false);
