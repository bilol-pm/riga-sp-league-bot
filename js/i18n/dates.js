/* Sana va oy nomlari to'rt tilda: kun nomi, qisqa hafta kunlari, oylar, "22-noyabr" / "Nov 22" / "22 ноября" / "22. novembris" ko'rinishi. */

const DAYS_L = {
  uz: ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'],
  en: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  ru: ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'],
  lv: ['Svētdiena','Pirmdiena','Otrdiena','Trešdiena','Ceturtdiena','Piektdiena','Sestdiena']
};
const WD_L = { uz: ['Du','Se','Ch','Pa','Ju','Sh','Ya'], en: ['Mo','Tu','We','Th','Fr','Sa','Su'], ru: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'], lv: ['Pr','Ot','Tr','Ce','Pk','Se','Sv'] };
const MONTHS_L = {
  uz: ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  ru: ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
  lv: ['janvāris','februāris','marts','aprīlis','maijs','jūnijs','jūlijs','augusts','septembris','oktobris','novembris','decembris']
};
const MON_SHORT_RU = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const dayName = i => DAYS_L[LANG][i];
const weekdays = () => WD_L[LANG];
const monShort = i => LANG === 'ru' ? MON_SHORT_RU[i] : MONTHS_L[LANG][i].slice(0, 3);
// "22-noyabr" | "Nov 22" | "22 ноября"
const dm = (day, mi) => LANG === 'en' ? `${MONTHS_L.en[mi]} ${day}` : LANG === 'ru' ? `${day} ${MONTHS_L.ru[mi]}` : LANG === 'lv' ? `${day}. ${MONTHS_L.lv[mi]}` : `${day}-${MONTHS_L.uz[mi]}`;
