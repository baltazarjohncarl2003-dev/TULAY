/**
 * BUYSON | File 09 — Buyer.gs
 * RFQ drafts, validation, submission and recorded supplier selection.
 *
 * Drop-in compatibility:
 *  - Public signatures remain apiSaveRfq(token, input, submit) and
 *    apiSelectSupplier(token, input); existing return properties are retained.
 *  - No Sheet name/column, session format, Script Property or existing RFQ ID
 *    is changed. No payment, order fulfillment or escrow is performed.
 *  - This module uses File 05 security, File 07 database and Discovery.gs.
 *
 * Buyer RFQs stay private until matched/admin-approved. Locks serialize writes
 * inside one Apps Script project only. Cross-sheet writes are not atomic.
 */

/** User-facing limits mirror the current Buyer.gs contract. */
const BUYSON_BUYER_LIMITS_ = Object.freeze({
  MAX_QUANTITY: 10000000,
  MAX_IDENT: 100,
  MAX_IDEMPOTENCY_KEY: 120,
  RETRY_WINDOW_HOURS: 24
});

/** Reject complex input early; never honor a browser-provided buyer_id/role. */
function buysonBuyerInput_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid sourcing request.');
  }
  return input;
}

/** Effective calendar date in Philippine time, not UTC midnight. */
function buysonBuyerToday_() {
  if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
    return Utilities.formatDate(new Date(), T.TIMEZONE, 'yyyy-MM-dd');
  }
  // Non-Apps-Script unit-test fallback; live requests use Manila timezone.
  return new Date().toISOString().slice(0, 10);
}

/**
 * Optional, additive idempotency key supported without a schema change.
 * The deterministic ID is scoped to the verified buyer and secret pepper.
 * Legacy File 03 requests without a key continue to use random IDs.
 * Never use the idempotency key as an RFQ reference or expose the digest.
 */
function buysonBuyerRequestId_(buyerId, input) {
  const raw = input.client_request_id === undefined || input.client_request_id === null
    ? input.idempotency_key : input.client_request_id;
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string' || raw.length < 12 || raw.length > BUYSON_BUYER_LIMITS_.MAX_IDEMPOTENCY_KEY ||
      !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new Error('Invalid request identifier.');
  }
  return 'brfq-' + digest_('buyer-rfq-idempotency:v1:' + buyerId + ':' + raw);
}

/** Stable normalized fields used to reject accidental key reuse for a new RFQ. */
function buysonBuyerPayloadEqual_(record, payload) {
  const fields = ['product','category','description','specs','quantity','unit',
    'city','province','required_by','budget','sharing_consent'];
  return fields.every(function (field) {
    const a = record[field], b = payload[field];
    if (field === 'quantity' || field === 'budget') {
      if ((a === '' || a === null || a === undefined) &&
          (b === '' || b === null || b === undefined)) return true;
      return Number(a) === Number(b);
    }
    if (field === 'sharing_consent') return String(a) === String(b);
    return String(a === null || a === undefined ? '' : a) ===
      String(b === null || b === undefined ? '' : b);
  });
}

/** Normalize first; validate mandatory submit fields independently of browser HTML. */
function buysonBuyerNormalizeRfq_(raw, submitting) {
  const p = buysonBuyerInput_(raw);
  const payload = {
    product: text_(p.product, 160, submitting),
    category: text_(p.category, 100, submitting),
    description: text_(p.description, 2500, submitting),
    specs: text_(p.specs, 1800, submitting),
    quantity: p.quantity === '' || p.quantity === null || p.quantity === undefined
      ? '' : positive_(p.quantity, 'Quantity', BUYSON_BUYER_LIMITS_.MAX_QUANTITY),
    unit: text_(p.unit || 'pcs', 20, true),
    city: text_(p.city, 100, submitting),
    province: text_(p.province, 100, submitting),
    required_by: isoDate_(p.required_by, submitting),
    budget: nonnegativeOptional_(p.budget, 'budget'),
    sharing_consent: p.sharing_consent === true
  };
  if (submitting) {
    if (payload.quantity === '' || payload.quantity <= 0) {
      throw new Error('Quantity is required.');
    }
    const cat = one_('Categories', {id: payload.category});
    if (!cat || cat.status !== 'ACTIVE') throw new Error('Choose an active category.');
    if (!payload.sharing_consent) throw new Error('Supplier-sharing consent is required.');
    if (payload.required_by < buysonBuyerToday_()) {
      throw new Error('Delivery date must not be in the past.');
    }
  }
  return payload;
}

function buysonBuyerDailyLimit_(buyerId) {
  const policy = typeof DISCOVERY_LIMITS !== 'undefined' && DISCOVERY_LIMITS.rfqsPerBuyerDay
    ? DISCOVERY_LIMITS.rfqsPerBuyerDay : BUYSON_POLICY.SOURCING.RFQS_PER_BUYER_DAY;
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const count = rows_('RFQs').filter(function (r) {
    return r.buyer_id === buyerId && r.status !== 'DRAFT' &&
      String(r.updated_at || r.created_at) >= cutoff;
  }).length;
  if (count >= policy) {
    throw new Error('Daily sourcing-request limit reached. Please try again tomorrow or contact support.');
  }
}

function buysonBuyerLogNoncritical_(stage, error) {
  // Never log tokens, buyer-provided descriptions, supplier contacts or secrets.
  try { Logger.log('BUYSON buyer post-commit ' + stage + ' warning: ' +
    (error && error.name ? error.name : 'operation failed')); } catch (_) {}
}

/**
 * Create or edit drafts and submit for server-side supplier matching.
 * New requests can supply client_request_id (12–120 URL-safe characters).
 * Replays with the same key return the original response and have no writes.
 * Different payloads with the same key fail; draft edits use p.id instead.
 *
 * The existing frontend omits client_request_id, so identical legacy NEW
 * submissions cannot be deduplicated without changing the frontend. The
 * database uniqueness constraint guarantees only one transaction per RFQ.
 */
function apiSaveRfq(token, input, submit) {
  const user = requireRole_(token, ['BUYER']);
  const p = buysonBuyerInput_(input);
  if (submit !== true && submit !== false) throw new Error('Choose save draft or submit.');
  const payload = buysonBuyerNormalizeRfq_(p, submit === true);
  const userKeyId = buysonBuyerRequestId_(user.id, p);
  const editId = p.id === undefined || p.id === null || p.id === ''
    ? '' : text_(p.id, BUYSON_BUYER_LIMITS_.MAX_IDENT, true);
  if (editId && userKeyId && editId !== userKeyId) {
    // The submitted ID is authoritative for existing drafts; avoid two
    // competing identifiers that may belong to separate records.
    throw new Error('Edit a draft using its request ID only.');
  }
  return writeLocked_(function () {
    let existing = null;
    if (editId) existing = ownedRfq_(user, editId);
    else if (userKeyId) existing = one_('RFQs', {id: userKeyId});

    if (existing && existing.buyer_id !== user.id) throw new Error('Request not found.');

    // Idempotent replay after successful keyed submission. Do not re-run
    // matching, send notifications or consume the daily limit twice.
    if (existing && !editId && userKeyId) {
      if (!buysonBuyerPayloadEqual_(existing, payload)) {
        throw new Error('Request identifier was already used for different details.');
      }
      if (existing.status !== 'DRAFT') {
        return {ok: true, id: existing.id, ref: existing.ref, status: existing.status,
          invited: rows_('Matches').filter(function (m) { return m.rfq_id === existing.id; }).length,
          matchingNotice: 'This request was already submitted.', alreadyProcessed: true};
      }
      if (!submit) {
        return {ok: true, id: existing.id, ref: existing.ref,
          status: 'DRAFT', alreadyProcessed: true};
      }
      // A previously keyed draft is now being submitted for the first time.
    }

    if (existing && existing.status !== 'DRAFT') {
      throw new Error('Only drafts can be edited.');
    }
    if (submit) buysonBuyerDailyLimit_(user.id);

    let record;
    if (existing) {
      record = update_('RFQs', existing.id,
        Object.assign({}, payload, {status: submit ? 'UNDER_REVIEW' : 'DRAFT'}));
    } else {
      const attrs = Object.assign({}, payload, {
        ref: ref_('RFQ'), buyer_id: user.id,
        status: submit ? 'UNDER_REVIEW' : 'DRAFT'
      });
      if (userKeyId) attrs.id = userKeyId;
      record = insert_('RFQs', attrs);
    }

    try {
      audit_(user.id, submit ? 'RFQ_SUBMITTED' : 'RFQ_SAVED', 'RFQs', record.id, {});
    } catch (error) { buysonBuyerLogNoncritical_('RFQ audit', error); }
    if (!submit) return {ok: true, id: record.id, ref: record.ref, status: record.status};

    // Supplier discovery may fail after the RFQ itself commits to Sheets.
    // Do not pretend routing succeeded; retain UNDER_REVIEW (or partial
    // invitations) for an admin to reconcile and retry.
    try {
      const outcome = autoMatchSubmittedRfq_(record, 'BUYER_SUBMITTED');
      return {ok: true, id: record.id, ref: record.ref, status: outcome.status,
        invited: outcome.invited, matchingNotice: outcome.reason};
    } catch (error) {
      buysonBuyerLogNoncritical_('automatic matching', error);
      return {ok: true, id: record.id, ref: record.ref,
        status: (one_('RFQs', {id: record.id}) || record).status,
        invited: rows_('Matches').filter(function (m) { return m.rfq_id === record.id; }).length,
        matchingNotice: 'Your request was saved, but supplier routing requires administrator review.',
        needsAdminReview: true};
    }
  });
}

/**
 * Record a buyer's choice of the latest accepted supplier quotation.
 * - Never transfers or holds funds; only a supplier-selection record.
 * - Rejects completed / cancelled / unapproved or stale selections.
 * - Database uniqueness on Transactions.rfq_id prevents duplicate outcomes.
 * - On retries, duplicates fail clearly with NO new record or notification.
 */
function apiSelectSupplier(token, input) {
  const user = requireRole_(token, ['BUYER']);
  const p = buysonBuyerInput_(input);
  const rfqId = text_(p.rfq_id, 100, true);
  const quoteId = text_(p.quote_id, 100, true);
  const acceptedId = p.accepted_offer_id === '' || p.accepted_offer_id === undefined ||
    p.accepted_offer_id === null ? '' : text_(p.accepted_offer_id, 100, true);

  return writeLocked_(function () {
    const rfq = ownedRfq_(user, rfqId);
    if (one_('Transactions', {rfq_id: rfq.id})) {
      throw new Error('A supplier was already selected. No duplicate transaction was created.');
    }
    if (rfq.status !== 'INVITED' && rfq.status !== 'QUOTING') {
      throw new Error('Supplier selection is not available for this request.');
    }

    const quote = one_('Quotes', {id: quoteId});
    if (!quote || quote.rfq_id !== rfq.id) throw new Error('Quotation not found.');
    const supplier = one_('Suppliers', {id: quote.supplier_id});
    if (!supplier || supplier.approval_status !== 'APPROVED') {
      throw new Error('This supplier is no longer approved.');
    }
    const supplierUser = one_('Users', {id: supplier.user_id});
    if (!supplierUser || supplierUser.status !== 'ACTIVE' || supplierUser.role !== 'SUPPLIER') {
      throw new Error('Supplier account is not active.');
    }
    const match = one_('Matches', {rfq_id: rfq.id, supplier_id: supplier.id});
    if (!match || match.status !== 'ACCEPTED') {
      throw new Error('Supplier was not eligible for this request.');
    }
    const latest = latestQuotes_(rows_('Quotes').filter(function (q) {
      return q.rfq_id === rfq.id && q.supplier_id === supplier.id;
    }))[0];
    if (!latest || latest.id !== quote.id) {
      throw new Error('Please select the supplier’s most recent quotation.');
    }
    if (!quote.valid_until || quote.valid_until < buysonBuyerToday_()) {
      throw new Error('Quote expired. Request an updated quotation.');
    }
    // Recalculate from stored, validated monetary fields rather than trusting
    // quote.known_total or any financial values supplied by the client.
    const base = sumKnown_(quote);
    if (Number(quote.quantity) < Number(rfq.quantity)) {
      throw new Error('Quotation quantity does not cover the buyer request.');
    }
    let acceptedOffer = null;
    if (acceptedId) {
      acceptedOffer = one_('Offers', {id: acceptedId});
      if (!acceptedOffer || acceptedOffer.action !== 'COUNTER' ||
          acceptedOffer.rfq_id !== rfq.id || acceptedOffer.supplier_id !== supplier.id ||
          acceptedOffer.quote_id !== quote.id) {
        throw new Error('Negotiated terms are not mutually accepted.');
      }
      const decision = one_('Offers', {related_offer_id: acceptedOffer.id});
      const counterpart = acceptedOffer.actor_id === user.id ? supplier.user_id : user.id;
      if (!decision || decision.action !== 'ACCEPT' ||
          decision.rfq_id !== rfq.id || decision.supplier_id !== supplier.id ||
          decision.quote_id !== quote.id || decision.actor_id !== counterpart ||
          (acceptedOffer.actor_id !== user.id && acceptedOffer.actor_id !== supplier.user_id)) {
        throw new Error('Negotiated terms are not mutually accepted.');
      }
      if (Number(acceptedOffer.quantity) < Number(rfq.quantity)) {
        throw new Error('Negotiated quantity does not cover the buyer request.');
      }
    }
    const financial = acceptedOffer
      ? Object.assign({}, quote, {quantity: acceptedOffer.quantity,
          unit_price: acceptedOffer.unit_price}) : quote;
    const total = acceptedOffer ? sumKnown_(financial) : base;
    // Preflight both tables before the first cross-sheet write. Sheets still
    // cannot guarantee a rollback if a later service call fails.
    if (typeof assertDbSchema_ === 'function') {
      assertDbSchema_('Transactions', table_('Transactions'));
      assertDbSchema_('RFQs', table_('RFQs'));
    }
    const transaction = insert_('Transactions', {
      ref: ref_('TXN'), rfq_id: rfq.id, buyer_id: user.id,
      supplier_id: supplier.id, quote_id: quote.id,
      accepted_offer_id: acceptedOffer ? acceptedOffer.id : '',
      amount: total.amount, amount_is_estimate: total.partial,
      status: 'SUPPLIER_SELECTED'
    });
    // A failure after this append may leave a transaction but an RFQ with an
    // old status. Duplicate guards remain active until an operator reconciles.
    update_('RFQs', rfq.id, {status: 'SUPPLIER_SELECTED'});
    try {
      notify_(supplier.user_id, 'Your quotation was selected',
        'Buyer selected your quotation for ' + rfq.ref);
    } catch (error) { buysonBuyerLogNoncritical_('supplier notification', error); }
    try {
      audit_(user.id, 'SUPPLIER_SELECTED', 'Transactions', transaction.id,
        {rfq_id: rfq.id, supplier_id: supplier.id});
    } catch (error) { buysonBuyerLogNoncritical_('selection audit', error); }
    return {ok: true, transactionRef: transaction.ref, amount: total.amount,
      isEstimate: total.partial};
  });
}
