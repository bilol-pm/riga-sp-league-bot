/** HTTP qatlami: xato sinfi, JSON javob, CORS, so'rov tanasini o'qish. */
import { DEFAULT_ORIGIN, MAX_BODY_BYTES } from './config.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Faqat ruxsat etilgan saytlar (ALLOWED_ORIGIN) API'ga murojaat qila oladi
export function corsHeaders(env, req) {
  const allowed = String(env.ALLOWED_ORIGIN || DEFAULT_ORIGIN)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get('Origin') || '';
  const h = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Init-Data',
    'Access-Control-Max-Age': '86400',
  };
  if (allowed.includes('*')) h['Access-Control-Allow-Origin'] = '*';
  else if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export const json = (data, status, extra) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

export async function readBody(req) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY_BYTES) throw new HttpError(413, "So'rov juda katta");
  let b;
  try {
    b = await req.json();
  } catch (e) {
    throw new HttpError(400, "Noto'g'ri so'rov");
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, "Noto'g'ri so'rov");
  return b;
}
