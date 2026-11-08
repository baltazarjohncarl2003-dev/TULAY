/**
 * BUYSON | FILE 06 — Auth.gs
 *
 * Passwordless email sign-in, account registration, and session logout.
 *
 * DROP-IN COMPATIBILITY (Files 01–05):
 * - Public signatures: apiRequestCode(input), apiVerifyCode(input), apiLogout(token).
 * - Returns existing {ok,message}, {token,user,expiresInHours}, and {ok} shapes.
 * - Keeps SCHEMA.Users, SCHEMA.AuthCodes and SCHEMA.Sessions unchanged.
 * - Keeps legacy OTP hash: digest_('otp:' + email + ':' + sixDigits).
 * - Keeps legacy session hash: digest_('session:' + token).
 * - Keeps existing 72-character (two UUID) raw session-token format.
 * - Never replaces TULAY_AUTH_PEPPER or existing account/session records.
 *
 * SECURITY BOUNDARY:
 * A six-digit email OTP is suitable only with conservative verification limits.
 * Email-only self-service must not be used as a high-assurance admin login.
 * This module cannot enforce per-IP/device controls: Apps Script google.script.run
 * does not supply a verified client IP. Add a trusted anti-abuse layer before
 * an unrestricted public launch. Never expose AuthCodes/Sessions sheets.
 */

/** Limits deliberately conservative for low-volume Apps Script pilot use.
 * All counters are derived from existing AuthCodes rows, not new tables.
 * Limits are per shared script/database, NOT per client-IP/device. */
const BUYSON_AUTH_LIMITS_ = Object.freeze({
  requestCooldownMs: 60 * 1000,
  perEmailHour: 4,
  perEmailDay: 12,
  globalHour: 60,
  globalDay: 200,
  perCodeAttempts: 5,
  perEmailFailedHour: 12,
  perEmailFailedDay: 30
});

/** Reject arrays and arbitrary primitives before interpreting browser input. */
function authInput_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid sign-in request.');
  }
  return input;
}

/** Date.parse is used only for historical timestamps already in AuthCodes. */
function authTimestamp_(value) {
  const n = Date.parse(String(value || ''));
  return Number.isFinite(n) ? n : NaN;
}

/** Count requests from the pre-existing AuthCodes table under the write lock.
 * Counts include delivery failures because a request still consumed capacity. */
function authCheckRequestLimits_(codes, email, now) {
  let totalHour = 0, totalDay = 0, emailHour = 0, emailDay = 0;
  let latestEmailAt = -Infinity;
  for (const c of codes) {
    const created = authTimestamp_(c.created_at);
    if (!Number.isFinite(created)) continue;
    const age = now - created;
    if (age < 0 || age > 24 * 60 * 60 * 1000) continue;
    totalDay++;
    const sameEmail = String(c.email || '').toLowerCase() === email;
    if (sameEmail) {
      emailDay++;
      if (created > latestEmailAt) latestEmailAt = created;
    }
    if (age < 60 * 60 * 1000) {
      totalHour++;
      if (sameEmail) emailHour++;
    }
  }
  const L = BUYSON_AUTH_LIMITS_;
  if (totalHour >= L.globalHour || totalDay >= L.globalDay ||
      emailHour >= L.perEmailHour || emailDay >= L.perEmailDay ||
      now - latestEmailAt < L.requestCooldownMs) {
    throw new Error('Too many code requests. Please try again later.');
  }
}

/** A new OTP must not reset all failed-verification attempts for an address.
 * The per-code limit is applied separately inside apiVerifyCode(). */
function authCheckVerifyLimits_(codes, email, now) {
  let failedHour = 0, failedDay = 0;
  for (const c of codes) {
    if (String(c.email || '').toLowerCase() !== email) continue;
    const created = authTimestamp_(c.created_at);
    const age = now - created;
    if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000) continue;
    const count = Number(c.attempts);
    if (!Number.isFinite(count) || count < 0) continue;
    failedDay += count;
    if (age < 60 * 60 * 1000) failedHour += count;
  }
  if (failedHour >= BUYSON_AUTH_LIMITS_.perEmailFailedHour ||
      failedDay >= BUYSON_AUTH_LIMITS_.perEmailFailedDay) {
    throw new Error('Too many verification attempts. Please try again later.');
  }
}

/** A HMAC-derived, rejection-sampled six-digit value avoids modulo bias.
 * The persistent server-side pepper protects the digest; two UUIDs act as a
 * fresh nonce. This does not change hashes of already-issued legacy codes.
 * Google Utilities.getUuid() is not a certified external entropy service;
 * security review remains required for higher-assurance deployments. */
function authGenerateCode_(email) {
  const width = 4294967296;                 // 2^32
  const maxUnbiased = Math.floor(width / 1000000) * 1000000;
  for (let round = 0; round < 4; round++) {
    const nonce = Utilities.getUuid() + Utilities.getUuid();
    const hex = digest_('buyson-otp-v1:' + email + ':' + nonce + ':' + Date.now() + ':' + round);
    if (!/^[a-f\d]{64}$/i.test(hex)) throw new Error('Sign-in is temporarily unavailable.');
    for (let pos = 0; pos < 64; pos += 8) {
      const n = parseInt(hex.slice(pos, pos + 8), 16);
      if (n < maxUnbiased) return String(n % 1000000).padStart(6, '0');
    }
  }
  throw new Error('Sign-in is temporarily unavailable.');
}

/** Fixed-work comparison for properly formed stored HMAC-SHA256 hex hashes. */
function authHashesEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' ||
      !/^[a-f\d]{64}$/i.test(a) || !/^[a-f\d]{64}$/i.test(b)) return false;
  let delta = 0;
  for (let i = 0; i < 64; i++) delta |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return delta === 0;
}

/** Prefer newest created_at; when timestamps tie, most recently appended row.
 * Ignores other email addresses without mutating or reordering the sheet. */
function authLatestCode_(codes, email) {
  let best = null, newestAt = -Infinity;
  for (const c of codes) {
    if (String(c.email || '').toLowerCase() !== email) continue;
    const timestamp = authTimestamp_(c.created_at);
    if (!Number.isFinite(timestamp)) continue;
    if (!best || timestamp >= newestAt) { best = c; newestAt = timestamp; }
  }
  return best;
}

/** Request a verification code. No account-existence lookup or user-role reveal.
 * Store hashes only, email the plaintext code directly, and never return it. */
function apiRequestCode(input) {
  const p = authInput_(input);
  const email = email_(p.email);
  // Names and roles are deliberately NOT trusted here. Verification remains
  // the only path to create a user and does not edit an existing user's role.
  if (p.name !== undefined) text_(p.name, 100, false);
  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error('Verification email is temporarily unavailable. Please try again later.');
  }

  const generated = writeLocked_(function () {
    const now = Date.now();
    authCheckRequestLimits_(rows_('AuthCodes'), email, now);
    const digits = authGenerateCode_(email);
    const record = insert_('AuthCodes', {
      email: email,
      code_hash: digest_('otp:' + email + ':' + digits),
      expires_at: new Date(now + T.OTP_MINUTES * 60000).toISOString(),
      attempts: 0,
      used_at: ''
    });
    return {id: record.id, digits: digits};
  });

  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Your BUYSON sign-in code',
      name: 'BUYSON',
      body: 'Your BUYSON verification code is ' + generated.digits + '\n\n' +
        'It expires in ' + T.OTP_MINUTES + ' minutes. ' +
        'If you did not request it, ignore this email. Never share the code.'
    });
  } catch (error) {
    // A failed send must not leave a fresh, undelivered code usable. Avoid
    // returning/logging the underlying MailApp error (may include addresses).
    try {
      writeLocked_(function () {
        const record = one_('AuthCodes', {id: generated.id});
        if (record && !record.used_at) {
          update_('AuthCodes', record.id, {used_at: now_()});
        }
      });
    } catch (ignored) {
      // If storage also failed, the code remains unexposed: do not mask the
      // delivery error with another exception or leak sensitive details.
    }
    throw new Error('Verification email could not be sent. Please try again later.');
  }
  return {ok: true, message: 'If delivery is available, a code has been sent. Check your inbox.'};
}

/** Verify only the latest OTP, atomically consume it, and mint a hashed session.
 * Existing accounts always retain their DB role/name/ID; only new accounts
 * receive a browser-requested BUYER/SUPPLIER role. ADMIN requires the exact
 * configured administrator email AND verification of that inbox. */
function apiVerifyCode(input) {
  const p = authInput_(input);
  const email = email_(p.email);
  const code = text_(p.code, 6, true);
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit code.');

  return writeLocked_(function () {
    const now = Date.now();
    const codes = rows_('AuthCodes');
    const record = authLatestCode_(codes, email);
    authCheckVerifyLimits_(codes, email, now);
    const expiry = record ? authTimestamp_(record.expires_at) : NaN;
    if (!record || record.used_at || !Number.isFinite(expiry) || expiry <= now ||
        !Number.isFinite(Number(record.attempts)) ||
        Number(record.attempts) >= BUYSON_AUTH_LIMITS_.perCodeAttempts) {
      throw new Error('Invalid or expired code. Request a new one if needed.');
    }

    const candidateHash = digest_('otp:' + email + ':' + code);
    if (!authHashesEqual_(record.code_hash, candidateHash)) {
      update_('AuthCodes', record.id, {attempts: Number(record.attempts) + 1});
      throw new Error('Invalid or expired code. Request a new one if needed.');
    }

    let user = one_('Users', {email: email});
    let pendingRegistration = null;
    if (!user) {
      // Validate registration details BEFORE consuming an otherwise good OTP.
      const name = text_(p.name, 100, true);
      if (name.length < 2) throw new Error('Please enter your full name.');
      const adminEmail = String(PropertiesService.getScriptProperties()
        .getProperty(T.PROP_ADMIN) || '').trim().toLowerCase();
      const role = email === adminEmail ? 'ADMIN' :
        (p.role === 'SUPPLIER' ? 'SUPPLIER' : 'BUYER');
      pendingRegistration = {email: email, name: name, role: role, status: 'ACTIVE'};
    } else if (user.status !== 'ACTIVE' ||
        !['BUYER', 'SUPPLIER', 'ADMIN'].includes(user.role)) {
      throw new Error('Account unavailable. Contact support.');
    }

    // Do not change the existing OTP hash or usage marker format.
    update_('AuthCodes', record.id, {used_at: now_()});
    if (pendingRegistration) {
      user = insert_('Users', pendingRegistration);
      audit_(user.id, 'ACCOUNT_REGISTERED', 'Users', user.id, {role: user.role});
    }

    // Preserve the exact legacy 72-character token + HMAC prefix so existing
    // sessions and BUYSON File 05 session_(token) continue to work unchanged.
    const token = uuid_() + uuid_();
    const session = insert_('Sessions', {
      token_hash: digest_('session:' + token),
      user_id: user.id,
      expires_at: new Date(now + T.SESSION_HOURS * 3600000).toISOString(),
      revoked_at: ''
    });
    if (!session || !session.id) throw new Error('Sign-in could not be completed.');
    return {token: token, user: safeUser_(user), expiresInHours: T.SESSION_HOURS};
  });
}

/** Idempotent logout: allow cleanup even for an expired/disabled account.
 * Revocation is by exact hashed bearer token; no email/role is client-trusted.
 * Never revoke an unrelated session or return token details to the browser. */
function apiLogout(token) {
  const raw = text_(token, 256, false);
  if (!/^[a-f\d-]{70,100}$/i.test(raw)) return {ok: true};
  return writeLocked_(function () {
    const session = one_('Sessions', {token_hash: digest_('session:' + raw)});
    if (session && !session.revoked_at) {
      update_('Sessions', session.id, {revoked_at: now_()});
    }
    return {ok: true};
  });
}
