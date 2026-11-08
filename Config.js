/**
 * BUYSON | FILE 08 — Config.gs
 * Canonical brand and compatibility configuration for the Apps Script pilot.
 *
 * BACKWARD-COMPATIBILITY CONTRACT
 * - T's pre-existing keys and values remain unchanged, including VERSION.
 * - TULAY_DB_ID, TULAY_ADMIN_EMAIL and TULAY_AUTH_PEPPER must NOT be renamed:
 *   deployed accounts and sessions depend on the existing properties.
 * - SCHEMA preserves every table name, column name and column order.
 * - T.CATS preserves the eight original category slugs/names and their order.
 * - Existing Auth.gs, Security.gs, Database.gs and backend API signatures stay
 *   untouched; this file performs NO reads/writes of Google Sheets on load.
 *
 * Security note: configuration is NOT authorization. Declarative policies below
 * do not enable enforcement in other modules unless those modules use them.
 * No credentials, tokens, database IDs or real account data belong in this file.
 */

/** Protect nested configuration arrays/objects against accidental mutations. */
function buysonDeepFreeze_(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.keys(value).forEach(function (key) {
      buysonDeepFreeze_(value[key]);
    });
    Object.freeze(value);
  }
  return value;
}

/**
 * Historical public internal contract. Other modules continue using T.NAME,
 * T.PROP_DB, T.OTP_MINUTES, T.ROLES, T.RFQ, T.CATS, etc. unchanged.
 * VERSION intentionally remains 1.0.0 until a coordinated application release.
 */
const T = buysonDeepFreeze_({
  NAME: 'BUYSON', VERSION: '1.0.0', TIMEZONE: 'Asia/Manila', CURRENCY: 'PHP',
  PROP_DB: 'TULAY_DB_ID', PROP_ADMIN: 'TULAY_ADMIN_EMAIL', PROP_PEPPER: 'TULAY_AUTH_PEPPER',
  OTP_MINUTES: 10, SESSION_HOURS: 12,
  ROLES: {BUYER: 'BUYER', SUPPLIER: 'SUPPLIER', ADMIN: 'ADMIN'},
  RFQ: {
    DRAFT: 'DRAFT', REVIEW: 'UNDER_REVIEW', INFO: 'NEEDS_INFORMATION',
    MATCHING: 'MATCHING', INVITED: 'INVITED', QUOTING: 'QUOTING',
    SELECTED: 'SUPPLIER_SELECTED', CANCELLED: 'CANCELLED'
  },
  CATS: [
    ['pouches', 'Pouches & Flexible Packaging'],
    ['boxes', 'Boxes & Cartons'],
    ['bottles', 'Bottles & Jars'],
    ['labels', 'Labels & Stickers'],
    ['food-containers', 'Cups & Food Containers'],
    ['paper-bags', 'Paper Bags'],
    ['mailers', 'Mailer Packaging'],
    ['other', 'Other Packaging']
  ]
});

/**
 * Live Google Sheets contract. Do not add, rename, reorder or remove columns
 * here without a separately tested, backed-up database migration.
 */
const SCHEMA = buysonDeepFreeze_({
  Users: ['id','email','name','role','status','created_at'],
  AccountProfiles: ['id','user_id','phone','business_name','industry','city','province','website','about','created_at','updated_at'],
  AuthCodes: ['id','email','code_hash','expires_at','attempts','used_at','created_at'],
  Sessions: ['id','token_hash','user_id','expires_at','revoked_at','created_at'],
  Suppliers: ['id','user_id','business_name','legal_name','category','city','province','description','moq','lead_days','approval_status','reviewed_by','reviewed_at','created_at','updated_at'],
  Categories: ['id','slug','name','status'],
  RFQs: ['id','ref','buyer_id','product','category','description','specs','quantity','unit','city','province','required_by','budget','sharing_consent','status','created_at','updated_at'],
  Matches: ['id','rfq_id','supplier_id','status','created_at','updated_at'],
  Quotes: ['id','ref','rfq_id','supplier_id','revision','quantity','unit_price','setup_fee','shipping_fee','tax_amount','lead_days','valid_until','payment_terms','notes','known_total','created_at'],
  Offers: ['id','rfq_id','supplier_id','quote_id','actor_id','action','quantity','unit_price','lead_days','payment_terms','message','related_offer_id','created_at'],
  Transactions: ['id','ref','rfq_id','buyer_id','supplier_id','quote_id','accepted_offer_id','amount','amount_is_estimate','status','created_at'],
  Messages: ['id','rfq_id','supplier_id','sender_id','body','created_at'],
  Notifications: ['id','user_id','title','body','is_read','created_at'],
  Audit: ['id','actor_id','event','entity','entity_id','details','created_at']
});

/**
 * Official public identity, aligned to the BUYSON bison artwork and Files 01–03.
 * These constants are references for future template/email integration; the
 * already-shipped design files and Auth.gs contain their own current copy.
 */
const BUYSON_BRAND = buysonDeepFreeze_({
  NAME: T.NAME,
  WORDMARK: 'BUYSON',
  TAGLINE: 'Buy Smart. Grow Big.',
  ORIGIN: 'BUY + BISON',
  MASCOT: 'Bison',
  MARKET: 'Philippine B2B marketplace',
  FIRST_CATEGORY: 'Custom packaging',
  CURRENCY: T.CURRENCY,
  COLORS: {
    BISON_INK: '#22053E',
    DEEP_VIOLET: '#401077',
    ROYAL_PURPLE: '#7724D5',
    ELECTRIC_PURPLE: '#9638F4',
    LAVENDER: '#D9A7FF',
    SURFACE: '#FAF9FD'
  }
});

/** Canonical state labels (the legacy RFQ mappings remain authoritative). */
const BUYSON_STATUS = buysonDeepFreeze_({
  ACCOUNT: {ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED'},
  SUPPLIER: {PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED'},
  PRODUCT: {PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED'},
  CATEGORY: {ACTIVE: 'ACTIVE'},
  RFQ: T.RFQ,
  MATCH: {INVITED: 'INVITED', ACCEPTED: 'ACCEPTED', DECLINED: 'DECLINED'},
  OFFER: {COUNTER: 'COUNTER', ACCEPT: 'ACCEPT', DECLINE: 'DECLINE'},
  PROMOTION: {ACTIVE: 'ACTIVE', PAUSED: 'PAUSED'},
  TRANSACTION: {SUPPLIER_SELECTED: 'SUPPLIER_SELECTED'}
});

/**
 * Reference policy values for the existing pilot modules.
 * - AUTH mirrors File 06's BUYSON_AUTH_LIMITS_ (which is currently enforced).
 * - SOURCING mirrors Discovery.gs DISCOVERY_LIMITS (currently enforced there).
 * Changes here alone DO NOT update those modules; the audit function below
 * catches drift when it is invoked in a staging test.
 */
const BUYSON_POLICY = buysonDeepFreeze_({
  AUTH: {
    OTP_MINUTES: T.OTP_MINUTES,
    SESSION_HOURS: T.SESSION_HOURS,
    COOLDOWN_MS: 60000,
    REQUESTS_PER_EMAIL_HOUR: 4,
    REQUESTS_PER_EMAIL_DAY: 12,
    REQUESTS_GLOBAL_HOUR: 60,
    REQUESTS_GLOBAL_DAY: 200,
    OTP_ATTEMPTS_PER_CODE: 5,
    FAILED_VERIFY_PER_EMAIL_HOUR: 12,
    FAILED_VERIFY_PER_EMAIL_DAY: 30
  },
  SOURCING: {
    RFQS_PER_BUYER_DAY: 5,
    AUTO_INVITES_PER_RFQ: 5,
    SEARCH_RESULT_LIMIT: 24,
    MAX_CATALOG_SCAN_ROWS: 1500,
    MAX_MANUAL_INVITEES: 10
  },
  COMMERCE: {
    MAX_QUANTITY: 10000000,
    CURRENCY: T.CURRENCY,
    QUOTE_PRICES_ARE_INDICATIVE: true,
    PLATFORM_HOLDS_FUNDS: false,
    PLATFORM_PROCESSES_PAYMENTS: false,
    TRANSACTION_RECORD_IS_ORDER_RECEIPT: false
  }
});

/**
 * Honest capability and release-status statements; NOT runtime feature gates.
 * A future live payment or escrow system requires separate reviewed services.
 */
const BUYSON_CAPABILITIES = buysonDeepFreeze_({
  EMAIL_OTP: 'IMPLEMENTED_PILOT',
  ACCOUNT_PROFILES: 'IMPLEMENTED_PILOT',
  SUPPLIER_ADMIN_APPROVAL: 'IMPLEMENTED_PILOT',
  PRODUCT_CATALOG: 'IMPLEMENTED_PILOT',
  SUPPLIER_MATCHING: 'IMPLEMENTED_PILOT',
  RFQ_AND_QUOTATIONS: 'IMPLEMENTED_PILOT',
  NEGOTIATION_AND_MESSAGES: 'IMPLEMENTED_PILOT',
  SUPPLIER_SELECTION_RECORD: 'IMPLEMENTED_PILOT',
  PAYMENTS: 'NOT_IMPLEMENTED',
  ESCROW: 'NOT_IMPLEMENTED',
  LIVE_ORDER_FULFILLMENT: 'NOT_IMPLEMENTED'
});

const BUYSON_RELEASE = buysonDeepFreeze_({
  CONFIG_REVISION: 'file08-rc1',
  DEPLOYMENT_STATUS: 'STAGING_REQUIRED',
  EXPECTED_APP_TIMEZONE: T.TIMEZONE,
  LEGACY_PROPERTY_KEYS_MUST_REMAIN: true,
  SCHEMA_MIGRATION_REQUIRED: false
});

/**
 * Private, read-only drift test. Names end in '_' to prevent google.script.run
 * from treating this function as a browser-callable endpoint.
 * It does not access Sheets, read secrets or write configuration properties.
 * Use in the isolated test harness after loading all backend modules.
 */
function buysonAssertConfiguration_() {
  function check(condition, description) {
    if (!condition) throw new Error('BUYSON configuration mismatch: ' + description);
  }
  check(T.NAME === 'BUYSON', 'public brand');
  check(T.CURRENCY === 'PHP' && T.TIMEZONE === 'Asia/Manila', 'locale');
  check(T.PROP_DB === 'TULAY_DB_ID' &&
        T.PROP_ADMIN === 'TULAY_ADMIN_EMAIL' &&
        T.PROP_PEPPER === 'TULAY_AUTH_PEPPER', 'legacy property keys');
  check(T.OTP_MINUTES === 10 && T.SESSION_HOURS === 12, 'legacy session settings');
  check(Object.keys(SCHEMA).length === 14, 'core table count');
  check(SCHEMA.Users.join(',') === 'id,email,name,role,status,created_at', 'Users schema');
  check(SCHEMA.Sessions.join(',') === 'id,token_hash,user_id,expires_at,revoked_at,created_at', 'Sessions schema');
  check(SCHEMA.AuthCodes.join(',') === 'id,email,code_hash,expires_at,attempts,used_at,created_at', 'AuthCodes schema');
  check(T.CATS.length === 8, 'legacy category count');
  check(new Set(T.CATS.map(function (entry) { return entry[0]; })).size === T.CATS.length,
    'duplicate category slugs');
  check(T.CATS.every(function (entry) {
    return Array.isArray(entry) && entry.length === 2 &&
      typeof entry[0] === 'string' && typeof entry[1] === 'string' &&
      entry[0].length > 0 && entry[1].length > 0;
  }), 'invalid category');
  check(Object.isFrozen(T) && Object.isFrozen(T.CATS) &&
        Object.isFrozen(SCHEMA) && Object.isFrozen(SCHEMA.Users), 'immutable configuration');
  check(BUYSON_STATUS.RFQ === T.RFQ, 'RFQ aliases');

  // Verify the declarative limits against the actual consuming modules.
  if (typeof BUYSON_AUTH_LIMITS_ !== 'undefined') {
    const a = BUYSON_AUTH_LIMITS_, p = BUYSON_POLICY.AUTH;
    check(a.requestCooldownMs === p.COOLDOWN_MS &&
      a.perEmailHour === p.REQUESTS_PER_EMAIL_HOUR &&
      a.perEmailDay === p.REQUESTS_PER_EMAIL_DAY &&
      a.globalHour === p.REQUESTS_GLOBAL_HOUR &&
      a.globalDay === p.REQUESTS_GLOBAL_DAY &&
      a.perCodeAttempts === p.OTP_ATTEMPTS_PER_CODE &&
      a.perEmailFailedHour === p.FAILED_VERIFY_PER_EMAIL_HOUR &&
      a.perEmailFailedDay === p.FAILED_VERIFY_PER_EMAIL_DAY, 'Auth.gs policy drift');
  }
  if (typeof DISCOVERY_LIMITS !== 'undefined') {
    const d = DISCOVERY_LIMITS, p = BUYSON_POLICY.SOURCING;
    check(d.rfqsPerBuyerDay === p.RFQS_PER_BUYER_DAY &&
      d.autoInvites === p.AUTO_INVITES_PER_RFQ &&
      d.searchResults === p.SEARCH_RESULT_LIMIT &&
      d.maxCatalogRows === p.MAX_CATALOG_SCAN_ROWS, 'Discovery.gs policy drift');
  }
  return {ok: true, revision: BUYSON_RELEASE.CONFIG_REVISION,
    verified: 'Legacy contract, immutable schema, categories, and available module policies'};
}
