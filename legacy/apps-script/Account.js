/**
 * BUYSON | FILE 15 — Account.gs
 * Verified-user personal profiles. Drop-in upgrade for the legacy V1.3
 * AccountProfiles extension; tested with BUYSON Files 01–14.
 *
 * PRESERVED CONTRACT:
 *   apiGetMyProfile(token) -> original private profile fields
 *   apiSaveMyProfile(token, details) -> {ok:true, profile:...}
 *   accountProfileFor_(verifiedUser), INSTALL_ACCOUNT_PROFILES_V13(),
 *   testAccountProfilesV13() remain available.
 *
 * Does not rename, create, or modify existing Sheet columns on import; never
 * changes verified email, role, approval status, account ID or session hashes.
 * Supplier company verification belongs exclusively to Supplier.gs/Admin.gs;
 * this personal profile does NOT publish or approve supplier information.
 *
 * IMPORTANT: Google Sheets has no atomic multi-sheet commit. The module checks
 * schemas and locks before writing, and makes exact replays no-ops, but a Sheets
 * outage can still interrupt between profile and Users name updates. Review
 * partial failures during staging/operations. Logs never include private fields.
 */

/** Legacy migration for a NEW project missing the AccountProfiles table.
 * Existing BUYSON installations should not call this or any installer. */
function INSTALL_ACCOUNT_PROFILES_V13() {
  const cols = SCHEMA.AccountProfiles;
  if (!cols || !Array.isArray(cols)) {
    throw new Error('AccountProfiles schema is unavailable.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = db_();
    let sheet = spreadsheet.getSheetByName('AccountProfiles');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('AccountProfiles');
      if (sheet.getMaxColumns() < cols.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), cols.length - sheet.getMaxColumns());
      }
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
      sheet.getRange(1, 1, 1, cols.length)
        .setBackground('#401077').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      // Inspect the entire expected header; no columns are added or shuffled.
      assertDbSchema_('AccountProfiles', sheet);
    }
    Logger.log('BUYSON: AccountProfiles table is available; account records unchanged.');
    return {ok:true, table:'AccountProfiles'};
  } finally {
    lock.releaseLock();
  }
}

/** Frontend and Code.gs both use this stable private response structure. */
function accountProfileFor_(user) {
  // This helper is INTERNAL; the two public APIs first resolve session_(token).
  if (!user || !user.id || !['BUYER','SUPPLIER','ADMIN'].includes(user.role)) {
    throw new Error('Account unavailable.');
  }
  const profile = one_('AccountProfiles', {user_id:user.id});
  const supplier = user.role === 'SUPPLIER'
    ? one_('Suppliers', {user_id:user.id}) : null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    status: user.status,
    phone: profile ? accountStoredPhone_(profile.phone) : '',
    business_name: profile ? String(profile.business_name || '') : (supplier ? String(supplier.business_name || '') : ''),
    industry: profile ? String(profile.industry || '') : '',
    city: profile ? String(profile.city || '') : (supplier ? String(supplier.city || '') : ''),
    province: profile ? String(profile.province || '') : (supplier ? String(supplier.province || '') : ''),
    website: profile ? String(profile.website || '') : '',
    about: profile ? String(profile.about || '') : '',
    updated_at: profile ? String(profile.updated_at || '') : '',
    has_saved_profile: !!profile,
    supplier_approval_status: supplier ? supplier.approval_status : null
  };
}

/** cleanCell_ escapes + at the start of a Sheet cell to prevent formulas.
 * Strip only that exact escape for a syntactically valid PH mobile number.
 * Without this, +639... phones render with a leading apostrophe and a replay
 * sees a false difference (and may reject its own persisted phone value). */
function accountStoredPhone_(value) {
  const raw = String(value || '');
  return /^'\+639\d{9}$/.test(raw) ? raw.slice(1) : raw;
}

/** Return ONLY the session owner's allowlisted profile—not raw Sheet rows. */
function apiGetMyProfile(token) {
  return accountProfileFor_(session_(token));
}

/** Restrict profile input to browser-submittable plain field objects. */
function accountPayload_(input) {
  if (!input || Object.prototype.toString.call(input) !== '[object Object]') {
    throw new Error('Invalid profile details.');
  }
  // Deliberately read only editable fields below; identity or privilege fields
  // (id, user_id, email, role, status, approval_status, etc.) have NO effect.
  return input;
}

/** Store only validated text, never arbitrary nested objects or unsafe URLs. */
function accountWebsite_(value) {
  const url = text_(value, 250, false);
  if (!url) return '';
  // No browser URL, DNS or network operations are performed here. Keep URL
  // parsing deterministic in Google Apps Script V8; forbid credentials and
  // local/private IP literals. The website is displayed, not fetched.
  const match = /^https:\/\/([^/?#]+)(?:[/?#][^\s\\]*)?$/i.exec(url);
  if (!match) throw new Error('Enter a public HTTPS website URL, or leave it blank.');
  const authority = match[1];
  if (authority.includes('@') || authority.includes('\\') || authority.includes('[') ||
      authority.includes(']') || /\s/.test(authority)) {
    throw new Error('Enter a public HTTPS website URL, or leave it blank.');
  }
  const parsed = /^([^:]+)(?::(\d{2,5}))?$/.exec(authority);
  if (!parsed) throw new Error('Enter a public HTTPS website URL, or leave it blank.');
  const host = parsed[1].toLowerCase();
  const port = parsed[2] ? Number(parsed[2]) : 443;
  if (port < 1 || port > 65535 || host.length > 253 ||
      !/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.') ||
      host.includes('..') || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      !host.includes('.') || /(^|\.)\d+$/.test(host.split('.').slice(-1).join('.')) ||
      host.split('.').some(function (label) {
        return !label || label.length > 63 || label.startsWith('-') || label.endsWith('-');
      })) {
    throw new Error('Enter a public HTTPS website URL, or leave it blank.');
  }
  // Explicitly reject IP literals, even publicly routable ones: business
  // websites should use DNS names. Prevent reserved/internal numeric hosts.
  if (/^\d+(?:\.\d+){3}$/.test(host) || /^\d+(?:\.\d+)*$/.test(host)) {
    throw new Error('Enter a public HTTPS website URL, or leave it blank.');
  }
  return url;
}

function accountFields_(payload) {
  const p = accountPayload_(payload);
  const name = text_(p.name, 100, true);
  if (name.length < 2) throw new Error('Please enter your full name.');
  const phone = text_(p.phone, 20, false).replace(/[\s()-]/g, '');
  if (phone && !/^(?:\+639|09)\d{9}$/.test(phone)) {
    throw new Error('Use a valid Philippine mobile number, such as 09XXXXXXXXX.');
  }
  return {
    name: name,
    details: {
      phone: phone,
      business_name: text_(p.business_name, 150, false),
      industry: text_(p.industry, 100, false),
      city: text_(p.city, 100, false),
      province: text_(p.province, 100, false),
      website: accountWebsite_(p.website),
      about: text_(p.about, 900, false)
    },
    // Optional optimistic check for future clients. Existing File 03 does not
    // send it, so legacy profile saves remain fully compatible.
    version: p.expected_updated_at === undefined ? null :
      text_(p.expected_updated_at, 50, false)
  };
}

/**
 * Persist an authenticated user's editable profile fields. No privilege data
 * is ever accepted from the payload. Exact repeated saves are harmless no-ops.
 * Optional expected_updated_at blocks stale writes from another browser tab.
 */
function apiSaveMyProfile(token, input) {
  // A bad or suspended account must not even validate private profile input.
  session_(token);
  const normalized = accountFields_(input);
  return writeLocked_(function () {
    // Critical: authorization and all ownership lookups repeat UNDER the lock.
    const current = session_(token);
    const profileSheet = table_('AccountProfiles');
    const usersSheet = table_('Users');
    assertDbSchema_('AccountProfiles', profileSheet);
    assertDbSchema_('Users', usersSheet);

    const prior = one_('AccountProfiles', {user_id:current.id});
    const storedVersion = prior ? String(prior.updated_at || '') : '';
    if (normalized.version !== null && normalized.version !== storedVersion) {
      throw new Error('Your profile changed in another session. Refresh and try again.');
    }

    const changed = Object.keys(normalized.details).filter(function (field) {
      return !prior || (field === 'phone' ? accountStoredPhone_(prior[field]) :
        String(prior[field] == null ? '' : prior[field])) !== normalized.details[field];
    });
    const nameChanged = current.name !== normalized.name;

    // Preserve profile IDs, timestamps and audit trail on identical replay.
    if (changed.length === 0 && !nameChanged) {
      return {ok:true, profile:accountProfileFor_(current)};
    }

    // Update only the changed properties to avoid needlessly touching a row.
    // Multi-sheet writes are not atomic: the deterministic retry path can
    // complete the Users.name change if profile storage already succeeded.
    let record = prior;
    if (!prior) {
      record = insert_('AccountProfiles', Object.assign({user_id:current.id}, normalized.details));
    } else if (changed.length) {
      const patch = {};
      changed.forEach(function (key) { patch[key] = normalized.details[key]; });
      record = update_('AccountProfiles', prior.id, patch);
    }
    if (nameChanged) update_('Users', current.id, {name:normalized.name});

    // Never let an unavailable Audit sheet make a committed profile save
    // look like a total failure. Report auditRecorded:false for follow-up.
    let auditRecorded = true;
    try {
      audit_(current.id, 'PERSONAL_PROFILE_UPDATED', 'AccountProfiles', record.id, {
        fields_changed: changed.concat(nameChanged ? ['name'] : [])
      });
    } catch (ignored) {
      auditRecorded = false;
      Logger.log('BUYSON account profile saved; audit write needs reconciliation.');
    }
    const response = {ok:true, profile:accountProfileFor_(one_('Users', {id:current.id}))};
    if (!auditRecorded) response.auditRecorded = false;
    return response;
  });
}

/** Non-destructive verification for staging. Does not install or alter tables. */
function testAccountProfilesV13() {
  assertDbSchema_('AccountProfiles', table_('AccountProfiles'));
  assertDbSchema_('Users', table_('Users'));
  const users = rows_('Users');
  Logger.log('PASS: BUYSON AccountProfiles and Users headers verified.');
  Logger.log('PASS: Existing user records retained: ' + users.length);
  Logger.log('SUCCESS: Account module ready. No records were changed.');
  return {ok:true,users:users.length};
}
