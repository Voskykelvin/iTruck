const crypto = require('crypto');
const AppError = require('../utils/AppError');
const { isLiveMode } = require('../config/runtime');

const ACCESS_COOKIE = process.env.ACCESS_COOKIE_NAME || 'itruck_access';
const REFRESH_COOKIE = process.env.REFRESH_COOKIE_NAME || 'itruck_refresh';
const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME || 'itruck_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseDurationMs(value, fallbackMs) {
  const input = String(value || '').trim();
  const match = input.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2] || 'ms';
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return amount * multipliers[unit];
}

function sameSite() {
  return process.env.AUTH_COOKIE_SAMESITE || process.env.REFRESH_COOKIE_SAMESITE || (isLiveMode() ? 'none' : 'lax');
}

function baseCookieOptions() {
  return {
    secure: isLiveMode(),
    sameSite: sameSite()
  };
}

function accessCookieOptions() {
  return {
    ...baseCookieOptions(),
    httpOnly: true,
    path: '/',
    maxAge: parseDurationMs(process.env.JWT_ACCESS_EXPIRES || process.env.JWT_EXPIRES || '15m', 15 * 60 * 1000)
  };
}

function refreshCookieOptions() {
  return {
    ...baseCookieOptions(),
    httpOnly: true,
    path: '/api/auth',
    maxAge: parseDurationMs(process.env.JWT_REFRESH_EXPIRES || '7d', 7 * 24 * 60 * 60 * 1000)
  };
}

function csrfCookieOptions() {
  return {
    ...baseCookieOptions(),
    httpOnly: false,
    path: '/',
    maxAge: parseDurationMs(process.env.JWT_REFRESH_EXPIRES || '7d', 7 * 24 * 60 * 60 * 1000)
  };
}

function clearCookie(res, name, options) {
  const clearOptions = { ...options };
  delete clearOptions.maxAge;
  res.clearCookie(name, clearOptions);
}

function setAuthCookies(res, { accessToken, refreshToken, csrfToken } = {}) {
  const csrf = csrfToken || crypto.randomBytes(24).toString('hex');
  if (accessToken) res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  if (refreshToken) res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  res.cookie(CSRF_COOKIE, csrf, csrfCookieOptions());
  return csrf;
}

function clearAuthCookies(res) {
  clearCookie(res, ACCESS_COOKIE, accessCookieOptions());
  clearCookie(res, REFRESH_COOKIE, refreshCookieOptions());
  clearCookie(res, CSRF_COOKIE, csrfCookieOptions());
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function accessTokenFromRequest(req) {
  const bearer = bearerToken(req);
  if (bearer) return { token: bearer, source: 'bearer' };
  const cookie = req.cookies?.[ACCESS_COOKIE];
  return cookie ? { token: cookie, source: 'cookie' } : { token: null, source: null };
}

function refreshTokenFromRequest(req) {
  return req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || null;
}

function secretsMatch(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function assertCsrf(req, source = req.authSource) {
  if (SAFE_METHODS.has(req.method) || source !== 'cookie') return;
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !secretsMatch(cookie, header)) {
    throw AppError.forbidden('Invalid CSRF token');
  }
}

module.exports = {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  accessTokenFromRequest,
  assertCsrf,
  clearAuthCookies,
  parseDurationMs,
  refreshCookieOptions,
  refreshTokenFromRequest,
  setAuthCookies
};
