/**
 * BUYSON | FILE 11 — Catalog.gs
 * Supplier-owned product listings, editorial promotions, and public catalog.
 *
 * COMPATIBILITY: MARKET_SCHEMA, all legacy helper names and the seven public
 * functions retain their existing names, argument positions and return keys.
 * Products/Promotions columns, existing IDs and stored records are unchanged.
 * Not a payment system, product certification or inventory guarantee.
 *
 * IMPORTANT: database writes must be called inside writeLocked_(). Sheets
 * operations are not atomic transactions; audit/notification failures are
 * logged after the primary mutation without creating duplicate listings.
 */
const MARKET_SCHEMA = Object.freeze({
  Products: ['id','supplier_id','title','category_id','description','unit','moq','indicative_price','lead_days','image_url','status','is_featured','reviewed_by','reviewed_at','created_at','updated_at'],
  Promotions: ['id','headline','subheading','eyebrow','cta_label','category_slug','image_url','theme','sort_order','status','created_at','updated_at']
});

/** Historical one-time installer, only for NEW test projects. Never run it on
 * the existing production database. Inspects existing sheets before mutation. */
function INSTALL_MARKETPLACE_V11() {
  const ss = db_();
  return writeLocked_(function () {
    Object.keys(MARKET_SCHEMA).forEach(function (name) {
      const sheet = ss.getSheetByName(name);
      if (sheet && sheet.getLastRow()) marketAssertSchema_(name, sheet);
    });
    Object.keys(MARKET_SCHEMA).forEach(function (name) {
      let sheet = ss.getSheetByName(name);
      if (!sheet) sheet = ss.insertSheet(name);
      const fields = MARKET_SCHEMA[name];
      if (sheet.getMaxColumns() < fields.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), fields.length - sheet.getMaxColumns());
      }
      if (sheet.getLastRow() < 1) {
        sheet.getRange(1, 1, 1, fields.length).setValues([fields])
          .setBackground('#401077').setFontColor('white').setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
    });
    return {ok: true, message: 'Marketplace v1.1 is ready.'};
  });
}

/** Fail closed on damaged headers; never silently remap product fields. */
function marketAssertSchema_(name, sheet) {
  const fields = MARKET_SCHEMA[name];
  if (!fields || !sheet || sheet.getLastRow() < 1 || sheet.getMaxColumns() < fields.length) {
    throw new Error('Marketplace schema mismatch: ' + name + '. No changes were made.');
  }
  const actual = sheet.getRange(1, 1, 1, fields.length).getValues()[0];
  if (fields.some(function (field, i) { return field !== actual[i]; })) {
    throw new Error('Marketplace schema mismatch: ' + name + '. No changes were made.');
  }
}
function marketSheet_(name) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(MARKET_SCHEMA, name)) {
    throw new Error('Unknown marketplace table.');
  }
  const sheet = db_().getSheetByName(name);
  if (!sheet) throw new Error('Missing marketplace table: ' + name + '.');
  marketAssertSchema_(name, sheet);
  return sheet;
}
function marketRecord_(fields, values) {
  const result = {};
  fields.forEach(function (field, i) {
    const value = values[i];
    result[field] = value instanceof Date ? value.toISOString() : value;
  });
  return result;
}
function marketRows_(name) {
  const sheet = marketSheet_(name), fields = MARKET_SCHEMA[name];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, fields.length).getValues()
    .filter(function (row) { return !!row[0]; })
    .map(function (row) { return marketRecord_(fields, row); });
}
/** Find a single row by ID without loading all details for large catalogs. */
function marketOne_(name, id) {
  const sheet = marketSheet_(name), fields = MARKET_SCHEMA[name], last = sheet.getLastRow();
  if (last < 2 || id === null || id === undefined || id === '') return null;
  if (last <= 26) return marketRows_(name).find(function (r) { return String(r.id) === String(id); }) || null;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      const cells = sheet.getRange(i + 2, 1, 1, fields.length).getValues()[0];
      return marketRecord_(fields, cells);
    }
  }
  return null;
}
function marketAttributes_(name, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(function (field) { return MARKET_SCHEMA[name].indexOf(field) < 0; })) {
    throw new Error('Invalid marketplace record.');
  }
}
/** Must run under writeLocked_(). Never create a record with an existing ID. */
function marketInsert_(name, values) {
  marketAttributes_(name, values);
  const sheet = marketSheet_(name);
  const row = Object.assign({id: uuid_(), created_at: now_(), updated_at: now_()}, values);
  if (!row.id || marketOne_(name, row.id)) throw new Error('Duplicate marketplace record ID.');
  sheet.appendRow(MARKET_SCHEMA[name].map(function (field) { return cleanCell_(row[field]); }));
  return row;
}
/** Must run under writeLocked_(). Identity and creation timestamps immutable. */
function marketUpdate_(name, id, patch) {
  marketAttributes_(name, patch);
  if (Object.keys(patch).some(function (k) {
    return k === 'id' || k === 'created_at' || (name === 'Products' && k === 'supplier_id');
  })) throw new Error('Immutable marketplace identity field.');
  const sheet = marketSheet_(name), fields = MARKET_SCHEMA[name], last = sheet.getLastRow();
  if (last < 2) throw new Error('Marketplace record not found.');
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  const index = ids.findIndex(function (r) { return String(r[0]) === String(id); });
  if (index < 0) throw new Error('Marketplace record not found.');
  const row = marketRecord_(fields, sheet.getRange(index + 2, 1, 1, fields.length).getValues()[0]);
  Object.assign(row, patch, {updated_at: now_()});
  sheet.getRange(index + 2, 1, 1, fields.length).setValues([
    fields.map(function (field) { return cleanCell_(row[field]); })
  ]);
  return row;
}

/** Accept HTTPS publicly hosted images, not URLs containing credentials,
 * script schemes, internal endpoints or obvious private IP addresses.
 * Displayed images are third-party assets: BUYSON does not proxy them. */
function marketImage_(url) {
  const value = text_(url === null || url === undefined ? '' : url, 600, false).trim();
  if (!value) return '';
  const match = /^https:\/\/([a-z0-9][a-z0-9.-]*)(?::443)?(?:[/?#][^\s\\]*)?$/i.exec(value);
  if (!match) throw new Error('Image must use a public HTTPS URL.');
  const host = match[1].toLowerCase();
  if (!host.includes('.') || host.endsWith('.') || host.includes('..') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
      /(^|\.)localhost\./.test(host) || /^\d+(?:\.\d+){0,3}$/.test(host) ||
      /(^|\.)metadata\.google\.internal$/.test(host)) {
    throw new Error('Image must use a public HTTPS URL.');
  }
  return value;
}
function marketPrice_(price) {
  if (price === '' || price === null || price === undefined) return '';
  const number = nonnegativeOptional_(price, 'Indicative price');
  if (number <= 0) throw new Error('Indicative price must be positive or blank.');
  return number;
}
function marketProductPayload_(input) {
  const p = input;
  const categoryId = text_(p.category_id, 100, true);
  const qty = positive_(p.moq, 'MOQ', 10000000);
  if (Math.abs(Math.round(qty * 1000) - qty * 1000) > 0.000001) {
    throw new Error('MOQ supports up to three decimal places.');
  }
  const lead = p.lead_days === '' || p.lead_days === null || p.lead_days === undefined
    ? '' : positive_(p.lead_days, 'Lead time', 365);
  if (lead !== '' && !Number.isInteger(lead)) throw new Error('Lead time must be a whole number of days.');
  return {
    title: text_(p.title, 140, true), category_id: categoryId,
    description: text_(p.description, 1500, true),
    unit: text_(p.unit || 'pcs', 24, true), moq: qty,
    indicative_price: marketPrice_(p.indicative_price), lead_days: lead,
    image_url: marketImage_(p.image_url),
    status: 'PENDING', is_featured: false, reviewed_by: '', reviewed_at: ''
  };
}
function marketActiveCategory_(id) {
  const category = one_('Categories', {id: id});
  return !!(category && category.status === 'ACTIVE');
}
function marketSupplierLive_(supplier) {
  if (!supplier || supplier.approval_status !== 'APPROVED' || !supplier.user_id) return false;
  const user = one_('Users', {id: supplier.user_id});
  return !!(user && user.role === 'SUPPLIER' && user.status === 'ACTIVE');
}
function marketDuplicateProduct_(supplierId, product, ownId) {
  const normal = function (x) { return String(x || '').trim().replace(/\s+/g, ' ').toLowerCase(); };
  return marketRows_('Products').some(function (existing) {
    return existing.supplier_id === supplierId && existing.id !== ownId &&
      existing.category_id === product.category_id &&
      normal(existing.title) === normal(product.title) &&
      normal(existing.unit) === normal(product.unit);
  });
}
/** Existing safe public product shape; no hidden metadata or private contacts. */
function marketSafeProduct_(p, supplier) {
  return {
    id: p.id, supplier_id: p.supplier_id, supplier_name: supplier.business_name,
    title: p.title, category_id: p.category_id, description: p.description,
    unit: p.unit, moq: Number(p.moq),
    indicative_price: p.indicative_price === '' || p.indicative_price === null || p.indicative_price === undefined
      ? null : Number(p.indicative_price),
    lead_days: p.lead_days === '' || p.lead_days === null || p.lead_days === undefined
      ? null : Number(p.lead_days),
    image_url: p.image_url || '', is_featured: p.is_featured === true || String(p.is_featured) === 'true'
  };
}
/** Public listings require a live owner, live approval AND active category. */
function apiMarketplacePublic() {
  // Bulk read accounts once: public discovery should not do one Sheets lookup
  // per supplier. Admin review and writes still perform fresh direct lookups.
  const activeSupplierUsers = new Set(rows_('Users').filter(function (u) {
    return u.status === 'ACTIVE' && u.role === 'SUPPLIER';
  }).map(function (u) { return String(u.id); }));
  const suppliers = rows_('Suppliers').filter(function (s) {
    return s.approval_status === 'APPROVED' && activeSupplierUsers.has(String(s.user_id));
  });
  const byId = new Map(suppliers.map(function (s) { return [String(s.id), s]; }));
  const allowedCategories = new Set(rows_('Categories')
    .filter(function (c) { return c.status === 'ACTIVE'; }).map(function (c) { return String(c.id); }));
  const products = marketRows_('Products').filter(function (p) {
    return p.status === 'APPROVED' && byId.has(String(p.supplier_id)) &&
      allowedCategories.has(String(p.category_id)) && Number.isFinite(Number(p.moq)) && Number(p.moq) > 0;
  }).sort(function (a, b) {
    return Number(b.is_featured === true || String(b.is_featured) === 'true') -
      Number(a.is_featured === true || String(a.is_featured) === 'true') ||
      String(b.created_at).localeCompare(String(a.created_at));
  }).slice(0, 120).map(function (p) { return marketSafeProduct_(p, byId.get(String(p.supplier_id))); });
  const promotions = marketRows_('Promotions').filter(function (p) {
    return p.status === 'ACTIVE' && (!p.category_slug || T.CATS.some(function (c) { return c[0] === p.category_slug; }));
  }).sort(function (a, b) {
    return Number(a.sort_order || 0) - Number(b.sort_order || 0);
  }).slice(0, 10).map(function (p) {
    return {id: p.id, headline: p.headline, subheading: p.subheading,
      eyebrow: p.eyebrow, cta_label: p.cta_label, category_slug: p.category_slug || '',
      image_url: p.image_url || '', theme: p.theme || 'navy'};
  });
  return {products: products, promotions: promotions};
}
/** Scope supplier workspaces to their OWN listings; buyers see no private data. */
function apiMarketplaceWorkspace(token) {
  const user = session_(token);
  if (user.role === 'ADMIN') return {products: marketRows_('Products'), promotions: marketRows_('Promotions')};
  if (user.role === 'SUPPLIER') {
    const supplier = one_('Suppliers', {user_id: user.id});
    return {products: supplier ? marketRows_('Products').filter(function (p) {
      return p.supplier_id === supplier.id;
    }) : [], promotions: []};
  }
  return {products: [], promotions: []};
}
function marketSideEffect_(label, fn) {
  try { fn(); } catch (error) {
    Logger.log('BUYSON marketplace ' + label + ' failed after save: ' + String(error && error.message || error));
  }
}
/** Supplier edits always return to pending moderation, with ownership and
 * eligibility freshly verified INSIDE the same write lock as the mutation. */
function apiSupplierSaveProduct(token, input) {
  requireRole_(token, ['SUPPLIER']);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid product details.');
  const product = marketProductPayload_(input);
  const id = input.id ? text_(input.id, 100, true) : '';
  return writeLocked_(function () {
    const user = requireRole_(token, ['SUPPLIER']);
    const supplier = supplierApproved_(user);
    if (!marketSupplierLive_(supplier)) throw new Error('Supplier account is unavailable.');
    if (!marketActiveCategory_(product.category_id)) throw new Error('Select a valid product category.');
    let old = null;
    if (id) {
      old = marketOne_('Products', id);
      if (!old || old.supplier_id !== supplier.id) throw new Error('This product does not belong to your supplier account.');
    }
    if (marketDuplicateProduct_(supplier.id, product, id)) {
      throw new Error('This supplier already has a product with the same title, category and unit.');
    }
    const saved = old ? marketUpdate_('Products', id, product)
      : marketInsert_('Products', Object.assign({supplier_id: supplier.id}, product));
    marketSideEffect_('product audit', function () {
      audit_(user.id, 'PRODUCT_SUBMITTED', 'Products', saved.id, {status: 'PENDING'});
    });
    return {ok: true, id: saved.id, status: 'PENDING'};
  });
}
/** Moderation is server controlled; client-supplied status is ignored. */
function apiAdminReviewProduct(token, id, approved) {
  admin_(token);
  const productId = text_(id, 100, true);
  if (approved !== true && approved !== false) throw new Error('Invalid review decision.');
  return writeLocked_(function () {
    const user = admin_(token);
    const product = marketOne_('Products', productId);
    if (!product) throw new Error('Product not found.');
    if (product.status !== 'PENDING') throw new Error('Only pending product listings can be reviewed.');
    const supplier = one_('Suppliers', {id: product.supplier_id});
    if (approved === true && !marketSupplierLive_(supplier)) throw new Error('Supplier must be approved and active.');
    if (approved === true && !marketActiveCategory_(product.category_id)) {
      throw new Error('Product category must be active.');
    }
    const status = approved ? 'APPROVED' : 'REJECTED';
    marketUpdate_('Products', productId, {status: status, reviewed_by: user.id, reviewed_at: now_()});
    marketSideEffect_('product moderation audit', function () {
      audit_(user.id, 'PRODUCT_REVIEWED', 'Products', productId, {status: status});
    });
    if (supplier) marketSideEffect_('product review notification', function () {
      notify_(supplier.user_id, 'Product review result',
        'Your product listing ' + product.title + ' is ' + status.toLowerCase() + '.');
    });
    return {ok: true, status: status};
  });
}
/** Editorial banners are admin-authored; NEVER implies paid sponsorship. */
function apiAdminSavePromotion(token, input) {
  admin_(token);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promotion details.');
  const p = input;
  const category = text_(p.category_slug || '', 60, false);
  if (category && !T.CATS.some(function (c) { return c[0] === category; })) {
    throw new Error('Unsupported promotion category.');
  }
  const theme = text_(p.theme || 'navy', 24, true);
  if (['navy', 'blue', 'peach', 'mint', 'violet'].indexOf(theme) < 0) {
    throw new Error('Invalid banner theme.');
  }
  const rawSort = p.sort_order === undefined || p.sort_order === null || p.sort_order === '' ? 0 : p.sort_order;
  const sort = numericInput_(rawSort, 'sort order', false);
  if (!Number.isInteger(sort) || Math.abs(sort) > 100000) throw new Error('Invalid sort order.');
  const status = p.status === undefined || p.status === '' || p.status === 'ACTIVE' ? 'ACTIVE'
    : p.status === 'PAUSED' ? 'PAUSED' : null;
  if (!status) throw new Error('Invalid promotion status.');
  const payload = {
    headline: text_(p.headline, 100, true),
    subheading: text_(p.subheading, 240, true),
    eyebrow: text_(p.eyebrow || 'Discover suppliers', 65, true),
    cta_label: text_(p.cta_label || 'Explore products', 40, true),
    category_slug: category, image_url: marketImage_(p.image_url),
    theme: theme, sort_order: sort, status: status
  };
  const id = p.id ? text_(p.id, 100, true) : '';
  return writeLocked_(function () {
    const user = admin_(token);
    const saved = id ? marketUpdate_('Promotions', id, payload) : marketInsert_('Promotions', payload);
    marketSideEffect_('promotion audit', function () {
      audit_(user.id, 'PROMOTION_SAVED', 'Promotions', saved.id, {status: saved.status});
    });
    return {ok: true, id: saved.id};
  });
}
function apiAdminTogglePromotion(token, id, active) {
  admin_(token);
  const promotionId = text_(id, 100, true);
  if (active !== true && active !== false) throw new Error('Invalid promotion status.');
  return writeLocked_(function () {
    const user = admin_(token);
    const promotion = marketOne_('Promotions', promotionId);
    if (!promotion) throw new Error('Promotion not found.');
    const status = active ? 'ACTIVE' : 'PAUSED';
    if (promotion.status === status) return {ok: true, status: status};
    marketUpdate_('Promotions', promotionId, {status: status});
    marketSideEffect_('promotion status audit', function () {
      audit_(user.id, 'PROMOTION_STATUS', 'Promotions', promotionId, {status: status});
    });
    return {ok: true, status: status};
  });
}
function testMarketplaceV11() {
  const products = marketRows_('Products'), promotions = marketRows_('Promotions');
  Logger.log('PASS: Marketplace tables and column order verified.');
  Logger.log('Products: ' + products.length + ', promotions: ' + promotions.length);
  return {ok: true, products: products.length, promotions: promotions.length};
}
