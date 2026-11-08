/**
 * BUYSON | FILE 05 — Security.gs
 *
 * Server-side identity, access checks, input validation, and quotation math.
 * Drop-in replacement for the legacy Security.gs used by Files 01–04.
 *
 * COMPATIBILITY:
 * - Preserves every existing helper name, signature, and API-facing return shape.
 * - Preserves TULAY_AUTH_PEPPER, the existing HMAC-SHA256 digest input, and
 *   72-character two-UUID session tokens. Existing accounts/sessions stay valid.
 * - Does not create/modify any Sheets, sessions, records, properties or scopes.
 * - Trailing underscore means these helpers are not callable via google.script.run.
 *
 * SECURITY SCOPE: These checks complement (do not replace) authorization inside
 * individual API functions. Payment, OTP abuse limits, deployment identity,
 * full-table scanning, admin state transitions, and transaction idempotency
 * require review of their OWN modules; this file cannot fix them alone.
 */

/** Bounded, trimmed plain text. Reject complex inputs instead of stringifying
 * objects (e.g. "[object Object]") into names or account identifiers. */
function text_(value, max, required) {
  if (value === null || value === undefined) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Invalid field value.');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Invalid field value.');
  }
  const limit = typeof max === 'number' && Number.isInteger(max) && max > 0 ? max : 2000;
  const s = String(value).trim().replace(/[\u0000-\u001F\u007F]/g, ' ');
  if (required && !s.trim()) throw new Error('A required field is missing.');
  if (s.length > limit) throw new Error('A field is too long.');
  return s;
}

/** Normalize sign-in email using the same lowercase format as existing rows. */
function email_(value) {
  const e = text_(value, 200, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) {
    throw new Error('Enter a valid email address.');
  }
  return e;
}

/** Reject NaN, infinities, booleans, objects and number notation not used by
 * BUYSON form fields. Caller-specific whole-number requirements are enforced by
 * the business modules; unit prices and kg quantities may be fractional. */
function numericInput_(value, label, optional) {
  if (value === '' || value === null || value === undefined) {
    if (optional) return null;
    throw new Error(label + ' is required.');
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error('Invalid ' + label + '.');
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) throw new Error('Invalid ' + label + '.');
    value = Number(s);
  }
  if (!Number.isFinite(value)) throw new Error('Invalid ' + label + '.');
  return value;
}

/** Positive quantity/price validation. Maintain historic maximum defaults. */
function positive_(value, label, max) {
  const name = String(label || 'Value');
  const n = numericInput_(value, name, false);
  const ceiling = typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : 10000000;
  if (n <= 0 || n > ceiling) throw new Error(name + ' must be a positive number.');
  return n;
}

/** Optional PHP amount; blank means UNKNOWN, never silently zero. */
function nonnegativeOptional_(value, label) {
  const name = String(label || 'amount');
  const n = numericInput_(value, name, true);
  if (n === null) return '';
  if (n < 0 || n > 1000000000) throw new Error('Invalid ' + name);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Valid Gregorian calendar dates, including leap years; no 2026-02-31 rollover.
 * This does not impose business rules on past dates (the callers already do). */
function isoDate_(value, required) {
  const v = text_(value, 10, required);
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Invalid date');
  const parts = v.split('-').map(Number);
  const year = parts[0], month = parts[1], day = parts[2];
  if (year < 100 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error('Invalid date');
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) throw new Error('Invalid date');
  return v;
}

/** DO NOT CHANGE: these bytes are part of the legacy OTP/session hash contract.
 * Changing the prefix, property key, digest, or representation invalidates
 * every unexpired session and OTP in the existing Google Sheets. */
function digest_(value) {
  const pepper = PropertiesService.getScriptProperties().getProperty(T.PROP_PEPPER);
  if (!pepper) throw new Error('Authentication is not configured.');
  return Utilities.computeHmacSha256Signature(String(value), pepper)
    .map(function (b) { return (b & 255).toString(16).padStart(2, '0'); }).join('');
}

/** Session identity always comes from the verified, stored token hash — never
 * an email, account ID, role, or supplier ID supplied by the browser. */
function session_(token) {
  const t = text_(token, 256, true);
  // The existing Auth.gs issues uuid_()+uuid_(). Allow original format; do
  // not accidentally require a new token encoding and log out existing users.
  if (!/^[a-f\d-]{70,100}$/i.test(t)) throw new Error('Please sign in again.');
  const record = one_('Sessions', {token_hash: digest_('session:' + t)});
  const expiry = record ? Date.parse(record.expires_at) : NaN;
  if (!record || record.revoked_at || !Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error('Session expired. Sign in again.');
  }
  const user = one_('Users', {id: record.user_id});
  if (!user || user.status !== 'ACTIVE') throw new Error('Account unavailable.');
  if (user.role !== 'BUYER' && user.role !== 'SUPPLIER' && user.role !== 'ADMIN') {
    throw new Error('Account unavailable.');
  }
  return user;
}

/** Enforced inside backend APIs; client role or hidden navigation is irrelevant. */
function requireRole_(token, allowed) {
  const user = session_(token);
  if (!Array.isArray(allowed) || !allowed.includes(user.role)) {
    throw new Error('You do not have permission to do that.');
  }
  return user;
}
function admin_(token) { return requireRole_(token, ['ADMIN']); }

/** Buyers can only mutate their own RFQ, administrators can review any RFQ. */
function ownedRfq_(user, id) {
  const rfq = one_('RFQs', {id: text_(id, 100, true)});
  if (!rfq || !user || (user.role !== 'ADMIN' &&
      !(user.role === 'BUYER' && rfq.buyer_id === user.id))) {
    throw new Error('Request not found.');
  }
  return rfq;
}

/** Resolve ONLY the supplier linked to the current verified user. */
function supplierByUser_(user) {
  if (!user || user.role !== 'SUPPLIER' || !user.id) {
    throw new Error('Complete your supplier profile first.');
  }
  const supplier = one_('Suppliers', {user_id: user.id});
  if (!supplier) throw new Error('Complete your supplier profile first.');
  return supplier;
}
function supplierApproved_(user) {
  const supplier = supplierByUser_(user);
  if (supplier.approval_status !== 'APPROVED') {
    throw new Error('Supplier account is awaiting approval.');
  }
  return supplier;
}

/** An invitation is a scoped permission, not a public RFQ URL.
 * Declined, revoked or malformed statuses never grant supplier access. */
function supplierAssigned_(supplier, rfqId) {
  if (!supplier || !supplier.id || supplier.approval_status !== 'APPROVED') {
    throw new Error('RFQ has not been assigned to this supplier.');
  }
  const match = one_('Matches', {
    rfq_id: text_(rfqId, 100, true), supplier_id: supplier.id
  });
  if (!match || (match.status !== 'INVITED' && match.status !== 'ACCEPTED')) {
    throw new Error('RFQ has not been assigned to this supplier.');
  }
  return match;
}

/** Latest quote per supplier. Map avoids __proto__ object-key collisions. */
function latestQuotes_(quotes) {
  const bySupplier = new Map();
  (quotes || []).forEach(function (quote) {
    if (!quote || !quote.supplier_id || !Number.isFinite(Number(quote.revision))) return;
    const previous = bySupplier.get(quote.supplier_id);
    if (!previous || Number(quote.revision) > Number(previous.revision)) {
      bySupplier.set(quote.supplier_id, quote);
    }
  });
  return Array.from(bySupplier.values());
}

/** Currency arithmetic in integer centavos; no fabricated zero fees.
 * Unsupported, overflowed or negative totals fail closed instead of becoming
 * NaN / Infinity / negative transaction records. Return signature unchanged. */
function sumKnown_(quote) {
  if (!quote || typeof quote !== 'object') throw new Error('Invalid quotation total.');
  const quantity = numericInput_(quote.quantity, 'quantity', false);
  const unit = numericInput_(quote.unit_price, 'unit price', false);
  if (quantity <= 0 || unit <= 0) throw new Error('Invalid quotation total.');
  const unitCents = Math.round((unit + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(unitCents) || unitCents <= 0) {
    throw new Error('Invalid quotation total.');
  }
  const baseCents = Math.round(quantity * unitCents);
  if (!Number.isSafeInteger(baseCents) || baseCents < 0) {
    throw new Error('Invalid quotation total.');
  }
  const keys = ['setup_fee', 'shipping_fee', 'tax_amount'];
  const missing = [];
  let cents = baseCents;
  keys.forEach(function (key) {
    const value = quote[key];
    if (value === '' || value === null || value === undefined) {
      missing.push(key);
      return;
    }
    const fee = numericInput_(value, key, false);
    if (fee < 0) throw new Error('Invalid quotation total.');
    const feeCents = Math.round((fee + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(feeCents)) throw new Error('Invalid quotation total.');
    cents += feeCents;
    if (!Number.isSafeInteger(cents)) throw new Error('Invalid quotation total.');
  });
  return {amount: cents / 100, partial: missing.length > 0, missing: missing};
}

/** Public user projection: do not return token hashes, OTPs, or properties. */
function safeUser_(user) {
  if (!user) throw new Error('Account unavailable.');
  return {id:user.id, email:user.email, name:user.name, role:user.role, status:user.status};
}

/** Buyer/admin access to a matched conversation; a supplier may access ONLY
 * their own active invitation, and loses access when declined/unapproved.
 * Write operations must additionally check lifecycle state in their API. */
function validateScope_(user, rfqId, supplierId) {
  if (!user || !['BUYER', 'SUPPLIER', 'ADMIN'].includes(user.role)) {
    throw new Error('Conversation not found.');
  }
  const id = text_(rfqId, 100, true);
  const sid = text_(supplierId, 100, true);
  const rfq = one_('RFQs', {id: id});
  const match = one_('Matches', {rfq_id: id, supplier_id: sid});
  if (!rfq || !match) throw new Error('Conversation not found.');
  if (user.role === 'ADMIN') return {r:rfq,m:match};
  if (user.role === 'BUYER' && rfq.buyer_id === user.id) {
    return {r:rfq,m:match};
  }
  if (user.role === 'SUPPLIER') {
    const supplier = supplierByUser_(user);
    if (supplier.id === sid && supplier.approval_status === 'APPROVED' &&
        (match.status === 'INVITED' || match.status === 'ACCEPTED')) {
      return {r:rfq,m:match};
    }
  }
  throw new Error('Conversation not found.');
}
