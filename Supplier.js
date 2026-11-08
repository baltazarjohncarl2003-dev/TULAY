/**
 * BUYSON | File 10 — Supplier.gs
 * Supplier onboarding, scoped RFQ invitations and append-only quotations.
 *
 * DROP-IN CONTRACT
 *   apiSaveSupplier(token, details)
 *   apiRespondInvite(token, rfqId, accepted)
 *   apiSubmitQuote(token, input)
 *
 * Preserves existing response fields, Google Sheets columns, IDs, session hashes,
 * property names and existing historic quote revisions. No database migration.
 * Requires Files 04–09 plus the existing discovery, catalogue and admin modules.
 *
 * Every write is serialized with File 07's writeLocked_(). ScriptLock only
 * coordinates writes within the same Apps Script project; it is NOT a cross-
 * sheet database transaction. Never claim payment/escrow or stock reservation.
 */

const BUYSON_SUPPLIER_LIMITS_ = Object.freeze({
  MAX_QUANTITY: 10000000,
  MAX_UNIT_PRICE: 1000000000,
  MAX_LEAD_DAYS: 365,
  MAX_REQUEST_KEY: 120,
  IDENT_MAX: 100
});

function buysonSupplierInput_(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.prototype.toString.call(value) !== '[object Object]') {
    throw new Error('Invalid ' + (label || 'supplier submission') + '.');
  }
  return value;
}

/** Required fields cannot be supplied with a forged supplier user or status. */
function buysonSupplierProfile_(input) {
  const p = buysonSupplierInput_(input, 'supplier profile');
  const moq = positive_(p.moq, 'MOQ', BUYSON_SUPPLIER_LIMITS_.MAX_QUANTITY);
  const leadDays = positive_(p.lead_days, 'Lead days', BUYSON_SUPPLIER_LIMITS_.MAX_LEAD_DAYS);
  if (!Number.isSafeInteger(leadDays)) throw new Error('Lead days must be a whole number.');
  return {
    business_name: text_(p.business_name, 150, true),
    legal_name: text_(p.legal_name, 150, true),
    category: text_(p.category, 100, true),
    city: text_(p.city, 100, true),
    province: text_(p.province, 100, true),
    description: text_(p.description, 1600, true),
    moq: moq,
    lead_days: leadDays
  };
}

/** Recheck account and verification inside the lock, not just before it. */
function buysonSupplierCurrent_(token, approvalRequired) {
  const currentUser = requireRole_(token, ['SUPPLIER']);
  const supplier = one_('Suppliers', {user_id: currentUser.id});
  if (approvalRequired && (!supplier || supplier.approval_status !== 'APPROVED')) {
    throw new Error('Supplier account is awaiting approval.');
  }
  return {user: currentUser, supplier: supplier};
}

/** Philippine calendar day: valid_until is a DATE, not an instant in UTC. */
function buysonSupplierToday_() {
  if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
    return Utilities.formatDate(new Date(), T.TIMEZONE, 'yyyy-MM-dd');
  }
  // Node test harnesses without full Apps Script Utilities use a UTC fallback.
  // Production always uses the Philippine calendar date above.
  return new Date().toISOString().slice(0, 10);
}

/** Reject unexpected string/number 'true' values for irreversible decisions. */
function buysonSupplierBoolean_(value, label) {
  if (value !== true && value !== false) {
    throw new Error((label || 'Decision') + ' must be confirmed.');
  }
  return value;
}

/**
 * Optional quote request-key idempotency. No new database column is needed:
 * a unique ID is derived using the server's existing pepper and supplier ID.
 * Keys are NOT supplier IDs, session tokens, quote references, or public data.
 * File 03 presently omits the key; the extension remains backward compatible.
 */
function buysonSupplierQuoteRequestId_(supplierId, rfqId, input) {
  const raw = input.client_request_id === undefined || input.client_request_id === null
    ? input.idempotency_key : input.client_request_id;
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string' || raw.length < 12 || raw.length > BUYSON_SUPPLIER_LIMITS_.MAX_REQUEST_KEY ||
      !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('Invalid quotation request identifier.');
  return 'sqt-' + digest_('supplier-quote-idempotency:v1:' + supplierId + ':' + rfqId + ':' + raw);
}

/** Store two-decimal PHP prices; never fabricate blank optional fees as zero. */
function buysonSupplierQuotePayload_(input) {
  const p = buysonSupplierInput_(input, 'quotation');
  const quantity = positive_(p.quantity, 'Quantity', BUYSON_SUPPLIER_LIMITS_.MAX_QUANTITY);
  const unitPrice = positive_(p.unit_price, 'Unit price', BUYSON_SUPPLIER_LIMITS_.MAX_UNIT_PRICE);
  const leadDays = positive_(p.lead_days, 'Lead time', BUYSON_SUPPLIER_LIMITS_.MAX_LEAD_DAYS);
  if (!Number.isSafeInteger(leadDays)) throw new Error('Lead time must be a whole number of days.');
  const cents = Math.round((unitPrice + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1) {
    throw new Error('Unit price must be at least PHP 0.01.');
  }
  const data = {
    quantity: quantity,
    unit_price: cents / 100,
    setup_fee: nonnegativeOptional_(p.setup_fee, 'setup fee'),
    shipping_fee: nonnegativeOptional_(p.shipping_fee, 'shipping fee'),
    tax_amount: nonnegativeOptional_(p.tax_amount, 'tax amount'),
    lead_days: leadDays,
    valid_until: isoDate_(p.valid_until, true),
    payment_terms: text_(p.payment_terms, 300, true),
    notes: text_(p.notes, 1200, false)
  };
  return data;
}

/** Compare normalised commercial terms for safely retrying a keyed request. */
function buysonSupplierSameQuote_(existing, payload) {
  const keys = ['quantity','unit_price','setup_fee','shipping_fee','tax_amount',
    'lead_days','valid_until','payment_terms','notes'];
  return keys.every(function (key) {
    const oldValue = existing[key], newValue = payload[key];
    if (key === 'quantity' || key === 'unit_price' || key === 'lead_days' ||
        key === 'setup_fee' || key === 'shipping_fee' || key === 'tax_amount') {
      if ((oldValue === '' || oldValue == null) && (newValue === '' || newValue == null)) return true;
      if (oldValue === '' || oldValue == null || newValue === '' || newValue == null) return false;
      return Number(oldValue) === Number(newValue);
    }
    return String(oldValue == null ? '' : oldValue) === String(newValue == null ? '' : newValue);
  });
}

/** Return the same public fields on initial submit and idempotent replay. */
function buysonSupplierQuoteResult_(quote, partial, alreadyProcessed) {
  return {
    ok: true, quoteId: quote.id, ref: quote.ref, revision: Number(quote.revision),
    knownTotal: Number(quote.known_total), partial: partial === true,
    alreadyProcessed: alreadyProcessed === true
  };
}

function buysonSupplierLogNoncritical_(stage, error) {
  // Never log buyer details, authentication secrets, quotations or payment terms.
  try { Logger.log('BUYSON supplier post-commit ' + stage + ' warning: ' +
    (error && error.name ? error.name : 'operation failed')); } catch (_) {}
}

/** Supplier application or requested re-review; admin owns approval. */
function apiSaveSupplier(token, details) {
  requireRole_(token, ['SUPPLIER']);
  const values = buysonSupplierProfile_(details);
  return writeLocked_(function () {
    const current = buysonSupplierCurrent_(token, false);
    const previous = current.supplier;
    if (previous) {
      if (previous.approval_status === 'APPROVED') {
        throw new Error('Contact Buyson support to change an approved supplier profile.');
      }
      // Clear an old rejection review before re-queueing the edited profile.
      const updated = update_('Suppliers', previous.id,
        Object.assign({}, values, {approval_status: 'PENDING', reviewed_by: '', reviewed_at: ''}));
      try { audit_(current.user.id, 'SUPPLIER_PROFILE_UPDATED', 'Suppliers', updated.id, {}); }
      catch (error) { buysonSupplierLogNoncritical_('profile audit', error); }
      return {ok: true, id: updated.id, status: updated.approval_status};
    }
    const created = insert_('Suppliers', Object.assign({user_id: current.user.id,
      approval_status: 'PENDING', reviewed_by: '', reviewed_at: ''}, values));
    try { audit_(current.user.id, 'SUPPLIER_PROFILE_CREATED', 'Suppliers', created.id, {}); }
    catch (error) { buysonSupplierLogNoncritical_('profile audit', error); }
    return {ok: true, id: created.id, status: created.approval_status};
  });
}

/** Invitation actions are supplier-scoped, lifecycle-aware and retry-safe. */
function apiRespondInvite(token, rfqId, accepted) {
  requireRole_(token, ['SUPPLIER']);
  const requestId = text_(rfqId, BUYSON_SUPPLIER_LIMITS_.IDENT_MAX, true);
  const decision = buysonSupplierBoolean_(accepted, 'Invitation response');
  return writeLocked_(function () {
    const current = buysonSupplierCurrent_(token, true);
    const supplier = current.supplier;
    const match = one_('Matches', {rfq_id: requestId, supplier_id: supplier.id});
    if (!match) throw new Error('RFQ invitation not found for this supplier.');
    const nextStatus = decision ? 'ACCEPTED' : 'DECLINED';
    // Replaying the SAME decision cannot reopen a declined invitation.
    if (match.status === nextStatus) return {ok: true, alreadyProcessed: true};
    if (match.status !== 'INVITED') throw new Error('This invitation has already been answered.');
    const rfq = one_('RFQs', {id: requestId});
    if (!rfq || !['INVITED', 'QUOTING'].includes(rfq.status) ||
        !(rfq.sharing_consent === true || String(rfq.sharing_consent).toLowerCase() === 'true')) {
      throw new Error('This sourcing request is not open for supplier responses.');
    }
    update_('Matches', match.id, {status: nextStatus});
    try { audit_(current.user.id, 'INVITATION_ANSWERED', 'Matches', match.id,
      {accepted: decision}); }
    catch (error) { buysonSupplierLogNoncritical_('invitation audit', error); }
    return {ok: true, alreadyProcessed: false};
  });
}

/**
 * Submit or revise a quotation by appending an immutable revision.
 * Eligibility, invitation, RFQ state, latest history and replay safety are all
 * checked INSIDE the same write lock. No client-supplied supplier_id is used.
 */
function apiSubmitQuote(token, input) {
  requireRole_(token, ['SUPPLIER']);
  const p = buysonSupplierInput_(input, 'quotation');
  const rfqId = text_(p.rfq_id, BUYSON_SUPPLIER_LIMITS_.IDENT_MAX, true);
  const payload = buysonSupplierQuotePayload_(p);
  return writeLocked_(function () {
    const current = buysonSupplierCurrent_(token, true);
    const supplier = current.supplier;
    const requestId = buysonSupplierQuoteRequestId_(supplier.id, rfqId, p);

    // Replay lookup deliberately happens before lifecycle checks. An already-
    // committed quote may be safely acknowledged even after RFQ selection.
    if (requestId) {
      const replay = one_('Quotes', {id: requestId});
      if (replay) {
        if (replay.rfq_id !== rfqId || replay.supplier_id !== supplier.id ||
            !buysonSupplierSameQuote_(replay, payload)) {
          throw new Error('Quotation request identifier was already used for different details.');
        }
        const known = sumKnown_(replay);
        return buysonSupplierQuoteResult_(replay, known.partial, true);
      }
    }

    if (payload.valid_until < buysonSupplierToday_()) {
      throw new Error('Quotation validity must be today or a future date (Philippine time).');
    }
    const rfq = one_('RFQs', {id: rfqId});
    if (!rfq || !['INVITED', 'QUOTING'].includes(rfq.status) ||
        !(rfq.sharing_consent === true || String(rfq.sharing_consent).toLowerCase() === 'true')) {
      throw new Error('RFQ is not open for quotation.');
    }
    const match = supplierAssigned_(supplier, rfq.id);
    if (match.status !== 'ACCEPTED') throw new Error('Accept the invitation before quoting.');
    if (!Number.isFinite(Number(rfq.quantity)) || Number(rfq.quantity) <= 0) {
      throw new Error('Invalid requested quantity. Contact BUYSON support.');
    }
    if (payload.quantity < Number(rfq.quantity)) {
      throw new Error('Quoted quantity cannot be below the requested quantity.');
    }

    const history = rows_('Quotes').filter(function (quote) {
      return quote.rfq_id === rfq.id && quote.supplier_id === supplier.id;
    });
    const maxRevision = history.reduce(function (max, quote) {
      const n = Number(quote.revision);
      if (!Number.isSafeInteger(n) || n < 1) {
        throw new Error('Malformed quotation history requires administrator review.');
      }
      return Math.max(max, n);
    }, 0);
    // File 03 does not yet send client_request_id. A byte-for-byte equivalent
    // repeat within 60 seconds is treated as a double-click/retry, not a new
    // commercial revision. Deliberate revisions can be made afterward.
    if (!requestId && history.length) {
      const recent = history.filter(function (q) {
        return Number(q.revision) === maxRevision;
      })[0];
      const createdAt = recent ? Date.parse(String(recent.created_at || '')) : NaN;
      if (recent && Number.isFinite(createdAt) &&
          Date.now() - createdAt >= 0 && Date.now() - createdAt <= 60000 &&
          buysonSupplierSameQuote_(recent, payload)) {
        const total = sumKnown_(recent);
        return buysonSupplierQuoteResult_(recent, total.partial, true);
      }
    }
    if (maxRevision >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Quotation revision limit exceeded.');
    }
    const revision = maxRevision + 1;
    const totals = sumKnown_(payload);
    if (typeof assertDbSchema_ === 'function') {
      assertDbSchema_('Quotes', table_('Quotes'));
      assertDbSchema_('RFQs', table_('RFQs'));
    }
    const values = Object.assign({}, payload, {
      ref: ref_('QT'), rfq_id: rfq.id, supplier_id: supplier.id,
      revision: revision, known_total: totals.amount
    });
    if (requestId) values.id = requestId;
    const quote = insert_('Quotes', values);

    // Append succeeded. Sheets cannot roll back a later RFQ/status failure;
    // retry protection and administrator reconciliation are still necessary.
    if (rfq.status !== 'QUOTING') {
      try { update_('RFQs', rfq.id, {status: 'QUOTING'}); }
      catch (error) { buysonSupplierLogNoncritical_('RFQ status update', error); }
    }
    try { notify_(rfq.buyer_id, 'New supplier quotation',
      'A supplier submitted a quote for ' + rfq.ref); }
    catch (error) { buysonSupplierLogNoncritical_('buyer notification', error); }
    try { audit_(current.user.id, 'QUOTE_SUBMITTED', 'Quotes', quote.id,
      {rfq_id: rfq.id, revision: revision}); }
    catch (error) { buysonSupplierLogNoncritical_('quote audit', error); }
    return buysonSupplierQuoteResult_(quote, totals.partial, false);
  });
}
