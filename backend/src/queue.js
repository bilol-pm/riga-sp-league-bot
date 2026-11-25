/**
 * Navbat (kutish ro'yxati) hisobi: yozilganlar created_at tartibida sanaladi; sig'imga sig'magan yozuv
 * "wait" bo'ladi. Bu har safar hisoblanadi, bazada saqlanmaydi. state.js va notify.js shundan foydalanadi.
 * `regs` created_at, id tartibida kelishi shart.
 */
import { safeJson } from './utils.js';

export function seatRegs(regs, capacity) {
  let used = 0;
  let waiting = 0;
  const rows = regs.map((r) => {
    const members = safeJson(r.members, []);
    const size = r.kind === 'team' ? members.length : 1;
    let wait = false;
    if (used + size <= capacity) used += size;
    else {
      wait = true;
      waiting += size;
    }
    return { r, members, size, wait };
  });
  return { rows, used, waiting };
}
