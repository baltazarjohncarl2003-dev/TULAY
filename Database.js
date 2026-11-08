/**
 * BUYSON | FILE 07 — Database.gs
 * Drop-in Google Sheets storage helpers for the existing Apps Script marketplace.
 *
 * Compatibility promises:
 * - No existing column, sheet name, user ID, session token or secret is changed.
 * - Preserves: INSTALL_TULAY, db_, table_, rows_, one_, now_, uuid_,
 *   cleanCell_, insert_, update_, writeLocked_, audit_, ref_ and notify_.
 * - Reads existing rows in their established column order and Date -> ISO format.
 * - Uses the legacy TULAY_DB_ID Script Property; do not rotate it on upgrade.
 *
 * Important limitations:
 * - A Google Sheets script lock serializes operations within THIS Apps Script
 *   project; it does not protect against spreadsheet edits or other projects.
 * - Multiple Sheets writes are NOT a database transaction. A failure halfway
 *   through a multi-step action can leave committed partial writes. Reconcile
 *   and repair failures; do not claim ACID guarantees.
 * - The Apps Script webapp execution identity and database sharing permissions
 *   must be verified separately before public deployment.
 */

/** Legacy one-time installer for NEW projects. Never invoke on the live project. */
function INSTALL_TULAY() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(T.PROP_DB)) throw new Error('Already installed; no changes made.');
  if (!props.getProperty(T.PROP_ADMIN)) {
    throw new Error('Set TULAY_ADMIN_EMAIL under Project Settings > Script Properties first.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Double-check while holding the same lock used for other writes.
    if (props.getProperty(T.PROP_DB)) throw new Error('Another installation already completed.');
    if (!props.getProperty(T.PROP_PEPPER)) {
      props.setProperty(T.PROP_PEPPER, Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
    }
    const file = SpreadsheetApp.create('BUYSON | Live Operations Database');
    const names = Object.keys(SCHEMA);
    names.forEach(function (name, i) {
      const sheet = i === 0 ? file.getSheets()[0] : file.insertSheet(name);
      sheet.setName(name);
      const cols = SCHEMA[name];
      if (sheet.getMaxColumns() < cols.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), cols.length - sheet.getMaxColumns());
      }
      sheet.getRange(1, 1, 1, cols.length).setValues([cols])
        .setBackground('#401077').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(1);
    });
    T.CATS.forEach(function (cat) {
      file.getSheetByName('Categories').appendRow([Utilities.getUuid(), cat[0], cat[1], 'ACTIVE']);
    });
    // Property is set only after the tables have been created.
    props.setProperty(T.PROP_DB, file.getId());
    Logger.log('BUYSON database installed. Store the spreadsheet URL securely.');
    return 'Installed. Existing projects should never run this installer again.';
  } finally {
    lock.releaseLock();
  }
}

function db_() {
  const id = PropertiesService.getScriptProperties().getProperty(T.PROP_DB);
  if (!id) throw new Error('Platform not installed. Run INSTALL_TULAY on a NEW project only.');
  return SpreadsheetApp.openById(id);
}

function table_(name) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SCHEMA, name)) {
    throw new Error('Unknown table');
  }
  const sheet = db_().getSheetByName(name);
  if (!sheet) throw new Error('Missing table: ' + name);
  return sheet;
}

/** Fail closed before mutating a mismatched or partly migrated table. */
function assertDbSchema_(name, sheet) {
  const expected = SCHEMA[name];
  if (!expected || sheet.getLastRow() < 1 || sheet.getMaxColumns() < expected.length) {
    throw new Error('Database schema mismatch in ' + name + '. No write performed.');
  }
  const actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  if (expected.some(function (field, i) { return actual[i] !== field; })) {
    throw new Error('Database schema mismatch in ' + name + '. No write performed.');
  }
}

/** Return fresh copies, never cached between users or invocations. */
function rows_(name) {
  const sheet = table_(name);
  const columns = SCHEMA[name];
  const end = sheet.getLastRow();
  if (end <= 1) return [];
  return sheet.getRange(2, 1, end - 1, columns.length).getValues()
    .filter(function (cells) { return !!cells[0]; })
    .map(function (cells) {
      const record = {};
      columns.forEach(function (column, i) {
        const value = cells[i];
        record[column] = value instanceof Date ? value.toISOString() : value;
      });
      return record;
    });
}

/**
 * Efficient exact-match lookup: read a single discriminator column, then only
 * matched complete rows. For tiny tables use one bulk read to reduce round trips.
 * Do not use CacheService: sessions, roles, OTPs and invitations must stay fresh.
 * Compare like legacy one_ did (String equality) for backward compatibility.
 */
function one_(name, where) {
  const sheet = table_(name);
  if (!where || typeof where !== 'object' || Array.isArray(where)) {
    throw new Error('Invalid lookup');
  }
  const keys = Object.keys(where);
  if (!keys.length || keys.some(function (key) { return SCHEMA[name].indexOf(key) < 0; })) {
    throw new Error('Invalid lookup');
  }
  const match = function (item) {
    return keys.every(function (key) { return String(item[key]) === String(where[key]); });
  };
  const end = sheet.getLastRow();
  if (end <= 1) return null;
  if (end <= 26) return rows_(name).find(match) || null;

  const preferred = ['id', 'token_hash', 'email', 'user_id', 'ref', 'related_offer_id', 'rfq_id', 'supplier_id'];
  const searchKey = preferred.find(function (key) { return keys.indexOf(key) >= 0; }) || keys[0];
  const columnIndex = SCHEMA[name].indexOf(searchKey) + 1;
  // One column replaces a full-table read of all sensitive fields.
  const values = sheet.getRange(2, columnIndex, end - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) !== String(where[searchKey])) continue;
    const cells = sheet.getRange(i + 2, 1, 1, SCHEMA[name].length).getValues()[0];
    if (!cells[0]) continue;
    const item = {};
    SCHEMA[name].forEach(function (column, j) {
      item[column] = cells[j] instanceof Date ? cells[j].toISOString() : cells[j];
    });
    if (match(item)) return item;
  }
  return null;
}

function now_() { return new Date().toISOString(); }
function uuid_() { return Utilities.getUuid(); }

/** Spreadsheet formula-injection protection, including leading whitespace. */
function cleanCell_(value) {
  if (value === null || typeof value === 'undefined') return '';
  // Preserve dates already stored as date cells when modifying other columns.
  if (value instanceof Date) return value;
  if (typeof value === 'object') value = JSON.stringify(value);
  if (typeof value === 'string' && /^\s*[=+@\-\t\r]/.test(value)) return "'" + value;
  return value;
}

/** Existing schema only; never create columns from untrusted attributes. */
function dbAttributes_(name, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error('Invalid database record');
  }
  const allowed = SCHEMA[name];
  const keys = Object.keys(values);
  if (keys.some(function (key) { return allowed.indexOf(key) === -1; })) {
    throw new Error('Unexpected database field');
  }
}

/** Natural uniqueness checks. Must be called under writeLocked_ to prevent
 * concurrent inserts in the same project. Does not repair historical duplicates. */
function dbCheckUnique_(tableName, row) {
  const groups = {
    Users: [['email']],
    AccountProfiles: [['user_id']],
    Suppliers: [['user_id']],
    Sessions: [['token_hash']],
    Matches: [['rfq_id', 'supplier_id']],
    Transactions: [['rfq_id']],
    Categories: [['slug']]
  };
  const constraints = groups[tableName] || [];
  constraints.forEach(function (columns) {
    // A constraint is checked only when all fields have meaningful values.
    if (!columns.every(function (key) {
      return row[key] !== undefined && row[key] !== null && row[key] !== '';
    })) return;
    const where = {};
    columns.forEach(function (key) { where[key] = row[key]; });
    if (one_(tableName, where)) throw new Error('Duplicate ' + tableName + ' record.');
  });
  // Only ONE decision may respond to a particular counteroffer.
  if (tableName === 'Offers' && (row.action === 'ACCEPT' || row.action === 'DECLINE') &&
      row.related_offer_id && one_('Offers', {related_offer_id: row.related_offer_id})) {
    throw new Error('Counteroffer already answered.');
  }
}

function insert_(tableName, attrs) {
  const sheet = table_(tableName);
  dbAttributes_(tableName, attrs);
  assertDbSchema_(tableName, sheet);
  const row = Object.assign({}, attrs);
  if (!row.id) row.id = uuid_();
  if (SCHEMA[tableName].includes('created_at') && !row.created_at) row.created_at = now_();
  if (SCHEMA[tableName].includes('updated_at') && !row.updated_at) row.updated_at = now_();
  // Protect even non-indexed tables from accidentally reusing an ID.
  if (one_(tableName, {id: row.id})) throw new Error('Duplicate record ID.');
  dbCheckUnique_(tableName, row);
  sheet.appendRow(SCHEMA[tableName].map(function (field) { return cleanCell_(row[field]); }));
  return row;
}

/** Existing append-only business history remains immutable. */
function update_(tableName, id, patch) {
  const sheet = table_(tableName);
  dbAttributes_(tableName, patch);
  assertDbSchema_(tableName, sheet);
  const immutable = ['Audit', 'Quotes', 'Offers', 'Messages', 'Transactions'];
  if (immutable.includes(tableName)) throw new Error('Immutable business record');
  const keys = Object.keys(patch);
  if (tableName === 'AuthCodes' && keys.some(function (k) {
    return k !== 'attempts' && k !== 'used_at';
  })) throw new Error('Immutable business record');
  const locked = {
    Sessions: ['token_hash', 'user_id', 'expires_at'],
    Users: ['email', 'role'],
    Suppliers: ['user_id'],
    AccountProfiles: ['user_id'],
    RFQs: ['buyer_id', 'ref'],
    Matches: ['rfq_id', 'supplier_id'],
    Notifications: ['user_id'],
    Categories: ['slug']
  };
  if (keys.some(function (key) {
    return key === 'id' || key === 'created_at' ||
      (locked[tableName] || []).includes(key);
  })) throw new Error('Immutable identity field');
  const end = sheet.getLastRow();
  if (end < 2) throw new Error('Record not found');
  const ids = sheet.getRange(2, 1, end - 1, 1).getValues();
  const index = ids.findIndex(function (cells) { return String(cells[0]) === String(id); });
  if (index < 0) throw new Error('Record not found');
  const before = sheet.getRange(index + 2, 1, 1, SCHEMA[tableName].length).getValues()[0];
  const row = {};
  SCHEMA[tableName].forEach(function (key, i) { row[key] = before[i]; });
  Object.assign(row, patch);
  if (SCHEMA[tableName].includes('updated_at')) row.updated_at = now_();
  sheet.getRange(index + 2, 1, 1, SCHEMA[tableName].length)
    .setValues([SCHEMA[tableName].map(function (field) { return cleanCell_(row[field]); })]);
  return row;
}

/** Serialize cooperating code paths, flush before releasing lock even on error.
 * NOTE: flush does not make a multi-sheet callback atomic; writes can commit
 * before the callback throws. Retrying a multi-step operation requires care. */
function writeLocked_(fn) {
  if (typeof fn !== 'function') throw new Error('Invalid database operation');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let result;
  let failure = null;
  try {
    try { result = fn(); } catch (err) { failure = err; }
    try { SpreadsheetApp.flush(); } catch (err) { if (!failure) failure = err; }
  } finally {
    lock.releaseLock();
  }
  if (failure) throw failure;
  return result;
}

function audit_(who, event, entity, entityId, notes) {
  return insert_('Audit', {
    actor_id: who || 'SYSTEM', event: event, entity: entity,
    entity_id: entityId || '', details: JSON.stringify(notes || {})
  });
}

function ref_(prefix) {
  return prefix + '-' + new Date().getTime().toString(36).toUpperCase() + '-' + uuid_().slice(0, 5).toUpperCase();
}

function notify_(userId, title, body) {
  if (!userId) return;
  return insert_('Notifications', {user_id: userId, title: title, body: body, is_read: false});
}
