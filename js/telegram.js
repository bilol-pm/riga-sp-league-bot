/* Telegram Mini App bilan ulanish: foydalanuvchi ma'lumoti, initData (server uchun imzo), tebranish. */

const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready(); tg.expand();
  try { tg.setHeaderColor('#15171e'); tg.setBackgroundColor('#15171e'); } catch (e) {}
}
const tu = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
const INIT = (tg && tg.initData) || '';
const MY_NAME = tu ? [tu.first_name, tu.last_name].filter(Boolean).join(' ') : '';
const MY_PHOTO = tu && tu.photo_url ? tu.photo_url : '';
const haptic = () => { try { tg.HapticFeedback.impactOccurred('light'); } catch (e) {} };
