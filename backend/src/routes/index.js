/** Marshrutlar jadvali: manzil -> funksiya. Yangi amal qo'shish uchun shu yerga bitta qator qo'shiladi. */
import { register, cancel } from './player.js';
import { saveGame, deleteGame, deleteReg } from './games.js';
import { addAdmin, removeAdmin } from './admins.js';
import { setAttendance, unblock } from '../moderation.js';

export const ROUTES = {
  '/api/register': register,
  '/api/cancel': cancel,
  '/api/admin/game': saveGame,
  '/api/admin/game/delete': deleteGame,
  '/api/admin/reg/delete': deleteReg,
  '/api/admin/attendance': setAttendance,
  '/api/admin/unblock': unblock,
  '/api/admin/admins/add': addAdmin,
  '/api/admin/admins/remove': removeAdmin,
};
