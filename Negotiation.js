/**
 * BUYSON | File 13 — Negotiation.gs
 * Secure, append-only RFQ conversations, counters and mutual decisions.
 *
 * DROP-IN API (unchanged):
 *   apiCounterOffer(token, input)          -> {ok, id}
 *   apiRespondOffer(token, offerId, accept)-> {ok, responseId}
 *   apiSendMessage(token, input)           -> {ok, id}
 *
 * No new Sheet columns, tables, Script Properties, session changes, or schema
 * migration. Optional client_request_id/idempotency_key works with older
 * clients that do not send it. Monetary values are indicative; no payments.
 *
 * Every decision is checked again INSIDE File 07's ScriptLock. ScriptLock does
 * not turn multiple Sheets writes into a transactional commit. Post-write
 * notification and audit errors are nonfatal and separately logged.
 */
const BUYSON_NEGOTIATION_LIMITS_ = Object.freeze({
  IDENT_MAX: 100,
  MAX_QUANTITY: 10000000,
  MAX_UNIT_PRICE: 1000000000,
  MAX_LEAD_DAYS: 365,
  MAX_NOTE: 1000,
  MAX_MESSAGE: 2000,
  KEY_MAX: 120,
  MESSAGES_PER_MINUTE: 30,
  COUNTERS_PER_HOUR: 20,
  UNKEYED_MESSAGE_DUP_MS: 5000
});

/** Prevent user-supplied arrays, dates and objects becoming persisted strings. */
function buysonNegotiationObject_(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.prototype.toString.call(input) !== '[object Object]') {
    throw new Error('Invalid ' + (label || 'request') + '.');
  }
  return input;
}

/** Only caller-scoped stable hashed IDs; no additional spreadsheet columns. */
function buysonNegotiationRequestId_(kind, actorId, contextId, input) {
  const raw = input.client_request_id === undefined || input.client_request_id === null
    ? input.idempotency_key : input.client_request_id;
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string' || raw.length < 12 ||
      raw.length > BUYSON_NEGOTIATION_LIMITS_.KEY_MAX ||
      !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new Error('Invalid request identifier.');
  }
  // Digest with existing application pepper; do not store the raw key or token.
  return 'bn-' + digest_('buyson-negotiation:v1:' + kind + ':' + actorId + ':' + contextId + ':' + raw);
}

/** Price stored to 2 decimals, as in File 10 Supplier.gs. */
function buysonNegotiationPayload_(input) {
  const p = buysonNegotiationObject_(input, 'counteroffer');
  const quantity = positive_(p.quantity, 'Quantity', BUYSON_NEGOTIATION_LIMITS_.MAX_QUANTITY);
  const unitPrice = positive_(p.unit_price, 'Unit price', BUYSON_NEGOTIATION_LIMITS_.MAX_UNIT_PRICE);
  const leadDays = positive_(p.lead_days, 'Lead time', BUYSON_NEGOTIATION_LIMITS_.MAX_LEAD_DAYS);
  if (!Number.isSafeInteger(leadDays)) throw new Error('Lead time must be a whole number of days.');
  const cents = Math.round((unitPrice + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1) throw new Error('Unit price must be at least PHP 0.01.');
  return {
    quote_id: text_(p.quote_id, BUYSON_NEGOTIATION_LIMITS_.IDENT_MAX, true),
    quantity: quantity,
    unit_price: cents / 100,
    lead_days: leadDays,
    payment_terms: text_(p.payment_terms, 300, true),
    message: text_(p.message, BUYSON_NEGOTIATION_LIMITS_.MAX_NOTE, false)
  };
}

/** Reject inactive suppliers and nonparticipants for WRITE access. */
function buysonNegotiationScope_(user, rfqId, supplierId, options) {
  const scope = validateScope_(user, rfqId, supplierId);
  const rfq = scope.r, match = scope.m;
  if (!['INVITED', 'QUOTING'].includes(rfq.status) ||
      !['INVITED', 'ACCEPTED'].includes(match.status)) {
    throw new Error('This conversation is closed.');
  }
  const supplier = one_('Suppliers', {id: supplierId});
  const owner = supplier && one_('Users', {id: supplier.user_id});
  if (!supplier || supplier.approval_status !== 'APPROVED' ||
      !owner || owner.role !== 'SUPPLIER' || owner.status !== 'ACTIVE') {
    throw new Error('This supplier is no longer available.');
  }
  if (user.role === 'BUYER' && rfq.buyer_id !== user.id) throw new Error('Not authorized.');
  if (user.role === 'SUPPLIER' && supplier.user_id !== user.id) throw new Error('Not authorized.');
  // An invitation permits initial messaging, but only acceptance permits
  // commercial negotiations and quoting. This retains the original chat UX.
  if (options && options.acceptedOnly && (match.status !== 'ACCEPTED' || rfq.status !== 'QUOTING')) {
    throw new Error('Supplier must accept the invitation before negotiation.');
  }
  return {rfq: rfq, match: match, supplier: supplier, supplierUser: owner};
}

/** A quoted revision can be negotiated only while it is current and valid. */
function buysonNegotiationQuote_(quoteId) {
  const quote = one_('Quotes', {id: quoteId});
  if (!quote) throw new Error('Quotation not found.');
  const scope = {quote: quote};
  const quotes = rows_('Quotes').filter(function (candidate) {
    return candidate.rfq_id === quote.rfq_id && candidate.supplier_id === quote.supplier_id;
  });
  const latest = latestQuotes_(quotes)[0];
  if (!latest || latest.id !== quote.id) throw new Error('Negotiate the latest quotation.');
  const today = (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function')
    ? Utilities.formatDate(new Date(), T.TIMEZONE, 'yyyy-MM-dd')
    : new Date().toISOString().slice(0, 10);
  if (!quote.valid_until || !/^\d{4}-\d{2}-\d{2}$/.test(String(quote.valid_until)) ||
      String(quote.valid_until) < today) {
    throw new Error('This quotation has expired. Request a new quotation.');
  }
  scope.latest = latest;
  return scope;
}

function buysonNegotiationSameCounter_(stored, payload, actorId) {
  return stored && stored.action === 'COUNTER' && stored.actor_id === actorId &&
    stored.quote_id === payload.quote_id &&
    Number(stored.quantity) === payload.quantity &&
    Number(stored.unit_price) === payload.unit_price &&
    Number(stored.lead_days) === payload.lead_days &&
    String(stored.payment_terms) === payload.payment_terms &&
    String(stored.message || '') === payload.message;
}

function buysonNegotiationRateLimit_(tableName, actorId, rfqId, windowMs, limit) {
  const now = Date.now();
  const count = rows_(tableName).filter(function (entry) {
    const actor = tableName === 'Messages' ? entry.sender_id : entry.actor_id;
    const created = Date.parse(entry.created_at);
    return actor === actorId && entry.rfq_id === rfqId &&
      Number.isFinite(created) && created <= now && created > now - windowMs &&
      (tableName !== 'Offers' || entry.action === 'COUNTER');
  }).length;
  if (count >= limit) throw new Error('Too many requests. Please try again later.');
}

function buysonNegotiationAfterCommit_(userId, notificationUserId, title, detail, event, entity, recordId, notes) {
  try {
    if (notificationUserId) notify_(notificationUserId, title, detail);
  } catch (err) { buysonNegotiationLog_('notification', err); }
  try {
    if (event) audit_(userId, event, entity, recordId, notes || {});
  } catch (err) { buysonNegotiationLog_('audit', err); }
}
function buysonNegotiationLog_(step, error) {
  // Never log tokens, emails, RFQ text, message contents or commercial terms.
  try { Logger.log('BUYSON negotiation post-write ' + step + ' warning: ' +
    (error && error.name ? error.name : 'operation failed')); } catch (_) {}
}

/** New counteroffer: append-only, buyer/supplier scoping and current quotation. */
function apiCounterOffer(token, input) {
  requireRole_(token, ['BUYER', 'SUPPLIER']);
  const payload = buysonNegotiationPayload_(input);
  const original = buysonNegotiationObject_(input, 'counteroffer');
  return writeLocked_(function () {
    const user = requireRole_(token, ['BUYER', 'SUPPLIER']);
    const quoteInfo = buysonNegotiationQuote_(payload.quote_id);
    const quote = quoteInfo.quote;
    const context = buysonNegotiationScope_(user, quote.rfq_id, quote.supplier_id, {acceptedOnly:true});
    const rfq = context.rfq;
    if (payload.quantity < Number(rfq.quantity)) {
      throw new Error('Proposed quantity must cover the buyer requirement.');
    }
    // Calculate using the quoted fee disclosure; never use a client-supplied total.
    sumKnown_(Object.assign({}, quote, {quantity: payload.quantity, unit_price: payload.unit_price}));
    const requestId = buysonNegotiationRequestId_('counter', user.id, payload.quote_id, original);
    if (requestId) {
      const prior = one_('Offers', {id: requestId});
      if (prior) {
        if (!buysonNegotiationSameCounter_(prior, payload, user.id)) {
          throw new Error('Request identifier was reused with different counteroffer terms.');
        }
        return {ok:true, id:prior.id, alreadyProcessed:true};
      }
    }
    buysonNegotiationRateLimit_('Offers', user.id, rfq.id, 3600000,
      BUYSON_NEGOTIATION_LIMITS_.COUNTERS_PER_HOUR);
    if (typeof assertDbSchema_ === 'function') assertDbSchema_('Offers', table_('Offers'));
    const offer = insert_('Offers', {
      ...(requestId ? {id:requestId} : {}),
      rfq_id: rfq.id, supplier_id: quote.supplier_id, quote_id: quote.id,
      actor_id: user.id, action: 'COUNTER', quantity: payload.quantity,
      unit_price: payload.unit_price, lead_days: payload.lead_days,
      payment_terms: payload.payment_terms, message: payload.message, related_offer_id:''
    });
    const notifyId = user.role === 'BUYER' ? context.supplierUser.id : rfq.buyer_id;
    buysonNegotiationAfterCommit_(user.id, notifyId, 'New counteroffer',
      'You have a new offer on ' + rfq.ref, 'COUNTEROFFER_SENT', 'Offers', offer.id, {});
    return {ok:true, id:offer.id};
  });
}

/** Only the other party can accept or decline. One response per offer. */
function apiRespondOffer(token, offerId, accept) {
  requireRole_(token, ['BUYER', 'SUPPLIER']);
  const id = text_(offerId, BUYSON_NEGOTIATION_LIMITS_.IDENT_MAX, true);
  if (accept !== true && accept !== false) throw new Error('Confirm your counteroffer decision.');
  return writeLocked_(function () {
    const user = requireRole_(token, ['BUYER', 'SUPPLIER']);
    const offer = one_('Offers', {id: id});
    if (!offer || offer.action !== 'COUNTER') throw new Error('Counteroffer not found.');
    const scope = buysonNegotiationScope_(user, offer.rfq_id, offer.supplier_id, {acceptedOnly:true});
    if (user.id === offer.actor_id) throw new Error('You cannot accept your own offer.');
    const participantIds = [scope.rfq.buyer_id, scope.supplierUser.id];
    if (!participantIds.includes(offer.actor_id) || !participantIds.includes(user.id)) {
      throw new Error('Counteroffer participant is invalid.');
    }
    // A response must refer to the current quote revision, never an unrelated
    // or superseded quotation. Restricts accepting stale financial terms.
    const quote = buysonNegotiationQuote_(offer.quote_id).quote;
    if (quote.rfq_id !== offer.rfq_id || quote.supplier_id !== offer.supplier_id) {
      throw new Error('Counteroffer quotation mismatch.');
    }
    const response = one_('Offers', {related_offer_id: offer.id});
    const action = accept ? 'ACCEPT' : 'DECLINE';
    if (response) {
      if (response.action === action && response.actor_id === user.id &&
          response.rfq_id === offer.rfq_id && response.related_offer_id === offer.id &&
          response.quote_id === offer.quote_id && response.supplier_id === offer.supplier_id) {
        return {ok:true, responseId: response.id, alreadyProcessed:true};
      }
      throw new Error('This counteroffer already has a response.');
    }
    if (typeof assertDbSchema_ === 'function') assertDbSchema_('Offers', table_('Offers'));
    const created = insert_('Offers', {
      rfq_id:offer.rfq_id, supplier_id:offer.supplier_id, quote_id:offer.quote_id,
      actor_id:user.id, action:action,
      quantity:offer.quantity, unit_price:offer.unit_price, lead_days:offer.lead_days,
      payment_terms:offer.payment_terms, message:'', related_offer_id:offer.id
    });
    buysonNegotiationAfterCommit_(user.id, offer.actor_id,
      'Counteroffer response', 'Your offer has been ' + (accept ? 'accepted' : 'declined'),
      'COUNTEROFFER_RESPONDED', 'Offers', created.id, {accepted:accept});
    return {ok:true, responseId:created.id};
  });
}

/** Scoped private messages, no public messages, no closed/declined threads. */
function apiSendMessage(token, input) {
  requireRole_(token, ['BUYER', 'SUPPLIER', 'ADMIN']);
  const p = buysonNegotiationObject_(input, 'message');
  const rfqId = text_(p.rfq_id, BUYSON_NEGOTIATION_LIMITS_.IDENT_MAX, true);
  const supplierId = text_(p.supplier_id, BUYSON_NEGOTIATION_LIMITS_.IDENT_MAX, true);
  const body = text_(p.body, BUYSON_NEGOTIATION_LIMITS_.MAX_MESSAGE, true);
  return writeLocked_(function () {
    const user = requireRole_(token, ['BUYER', 'SUPPLIER', 'ADMIN']);
    const scope = buysonNegotiationScope_(user, rfqId, supplierId, {acceptedOnly:false});
    const requestId = buysonNegotiationRequestId_('message', user.id,
      rfqId + ':' + supplierId, p);
    if (requestId) {
      const prior = one_('Messages', {id:requestId});
      if (prior) {
        if (prior.sender_id !== user.id || prior.rfq_id !== rfqId ||
            prior.supplier_id !== supplierId || prior.body !== body) {
          throw new Error('Request identifier was reused with a different message.');
        }
        return {ok:true, id:prior.id, alreadyProcessed:true};
      }
    } else {
      // Legacy frontend does not submit a request key. A brief exact-duplicate
      // window helps with double-clicked send without losing ordinary messages.
      const now = Date.now();
      const previous = rows_('Messages').filter(function (m) {
        const created = Date.parse(m.created_at);
        return m.sender_id === user.id && m.rfq_id === rfqId && m.supplier_id === supplierId &&
          m.body === body && Number.isFinite(created) && created <= now &&
          now - created <= BUYSON_NEGOTIATION_LIMITS_.UNKEYED_MESSAGE_DUP_MS;
      });
      if (previous.length) return {ok:true, id:previous[previous.length - 1].id, alreadyProcessed:true};
    }
    buysonNegotiationRateLimit_('Messages', user.id, rfqId, 60000,
      BUYSON_NEGOTIATION_LIMITS_.MESSAGES_PER_MINUTE);
    if (typeof assertDbSchema_ === 'function') assertDbSchema_('Messages', table_('Messages'));
    const message = insert_('Messages', {
      ...(requestId ? {id:requestId} : {}),
      rfq_id:rfqId, supplier_id:supplierId, sender_id:user.id, body:body
    });
    const notifyId = user.role === 'BUYER' ? scope.supplierUser.id :
      user.role === 'SUPPLIER' ? scope.rfq.buyer_id : '';
    buysonNegotiationAfterCommit_(user.id, notifyId, 'New message',
      'You have a new message about ' + scope.rfq.ref,
      'RFQ_MESSAGE_SENT', 'Messages', message.id, {rfq_id:rfqId});
    return {ok:true, id:message.id};
  });
}
