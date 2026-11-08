/**
 * BUYSON | FILE 14 — Admin.gs
 * Administrative supplier review, RFQ moderation, manual invitation routing,
 * optional account suspension and read-only audit history.
 *
 * DROP-IN CONTRACT:
 *   Retains apiAdminReviewSupplier(token,supplierId,approve),
 *   apiAdminReviewRfq(token,rfqId,nextStatus), and
 *   apiAdminMatch(token,rfqId,supplierIds) with their existing return keys.
 *   Adds apiAdminSetAccountStatus and apiAdminAuditLog (not used by File 03).
 *   Does not modify SCHEMA, marketplace/discovery tables, Script Properties,
 *   roles, session digests, or existing records when loaded.
 *
 * SECURITY BOUNDARY:
 *   Every mutation reauthorizes ADMIN within writeLocked_. All named target
 *   records and invitation statuses are read after locking. Browser values
 *   never supply actor IDs or authority. No role/email changes are offered.
 *   Current Google Sheets cannot make cross-table writes atomic; recovery
 *   on retries is best effort, not a transactional guarantee.
 */
const BUYSON_ADMIN_LIMITS_ = Object.freeze({
  MAX_MANUAL_SUPPLIERS: 10,
  AUDIT_PAGE_MAX: 50,
  AUDIT_SCAN_MAX: 25000
});

function buysonAdminId_(id) {
  return text_(id, 100, true);
}
function buysonAdminBool_(decision) {
  if (decision !== true && decision !== false) {
    throw new Error('Choose an explicit approve or reject decision.');
  }
  return decision;
}
function buysonAdminLog_(step, error) {
  // Audit failures must be visible to operators, but do not log input payloads,
  // accounts, supplier contacts, sheet contents, or tokens.
  try {
    Logger.log('BUYSON admin post-commit ' + step + ' failed: ' +
      (error && error.name || 'ServiceError'));
  } catch (_) {}
}
/** Audit/notification is best effort AFTER the business write. A retry must
 * not repeat a committed decision just because a notification service failed. */
function buysonAdminAfterCommit_(actor, event, entity, id, details, notifications) {
  let auditRecorded = true;
  try { audit_(actor, event, entity, id, details); }
  catch (error) { auditRecorded = false; buysonAdminLog_('audit', error); }
  (notifications || []).forEach(function (n) {
    try { notify_(n.user, n.title, n.body); }
    catch (error) { buysonAdminLog_('notification', error); }
  });
  return auditRecorded;
}
function buysonAdminPreflight_(names) {
  if (typeof assertDbSchema_ !== 'function') return;
  names.forEach(function (name) { assertDbSchema_(name, table_(name)); });
}
function buysonAdminActiveAccount_(id, role) {
  const owner = one_('Users', {id: id});
  if (!owner || owner.status !== 'ACTIVE' || owner.role !== role) {
    throw new Error('Linked account is not active or has the wrong role.');
  }
  return owner;
}
function buysonAdminConsent_(rfq) {
  return !!rfq && (rfq.sharing_consent === true ||
    String(rfq.sharing_consent).toLowerCase() === 'true');
}

/** Review a supplier application or explicitly revoke previously approved
 * status. Revocation uses the existing REJECTED value and does not erase data.
 * Returning a prior successful result is idempotent and sends no notification.
 * An unapproved owner cannot receive an APPROVED supplier decision. */
function apiAdminReviewSupplier(token, supplierId, approve) {
  admin_(token);
  const id = buysonAdminId_(supplierId);
  const approved = buysonAdminBool_(approve);
  return writeLocked_(function () {
    const actor = admin_(token);
    const supplier = one_('Suppliers', {id: id});
    if (!supplier) throw new Error('Supplier not found.');
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(supplier.approval_status)) {
      throw new Error('Supplier review status is invalid. Contact support.');
    }
    const next = approved ? 'APPROVED' : 'REJECTED';
    if (supplier.approval_status === next) {
      return {ok: true, status: next, alreadyProcessed: true};
    }
    if (approved) buysonAdminActiveAccount_(supplier.user_id, 'SUPPLIER');
    buysonAdminPreflight_(['Suppliers', 'Audit', 'Notifications']);
    const before = supplier.approval_status;
    update_('Suppliers', id, {
      approval_status: next, reviewed_by: actor.id, reviewed_at: now_()
    });
    const auditRecorded = buysonAdminAfterCommit_(actor.id,
      before === 'APPROVED' ? 'SUPPLIER_APPROVAL_REVOKED' : 'SUPPLIER_REVIEWED',
      'Suppliers', id, {from: before, to: next}, [
        {user: supplier.user_id, title: 'Supplier profile review',
          body: 'Your BUYSON supplier profile status is ' + next + '.'}
      ]);
    return {ok: true, status: next, auditRecorded: auditRecorded};
  });
}

/** Restricted RFQ state machine. Status-only no-ops are safe to repeat while
 * active. Terminal states and buyer drafts cannot be reopened by admin APIs.
 * The consent gate is at the point of disclosure (apiAdminMatch / discovery).
 */
function apiAdminReviewRfq(token, rfqId, nextStatus) {
  admin_(token);
  const id = buysonAdminId_(rfqId);
  if (typeof nextStatus !== 'string' ||
      !['MATCHING', 'NEEDS_INFORMATION', 'CANCELLED', 'UNDER_REVIEW'].includes(nextStatus)) {
    throw new Error('Unsupported review status.');
  }
  const transitions = {
    UNDER_REVIEW: ['MATCHING', 'NEEDS_INFORMATION', 'CANCELLED'],
    NEEDS_INFORMATION: ['UNDER_REVIEW', 'CANCELLED'],
    MATCHING: ['NEEDS_INFORMATION', 'CANCELLED'],
    INVITED: ['CANCELLED'],
    QUOTING: ['CANCELLED']
  };
  return writeLocked_(function () {
    const actor = admin_(token);
    const rfq = one_('RFQs', {id: id});
    if (!rfq || rfq.status === 'DRAFT' || rfq.status === 'CANCELLED' ||
        rfq.status === 'SUPPLIER_SELECTED') {
      throw new Error('This RFQ status change is not allowed.');
    }
    if (rfq.status === nextStatus) {
      return {ok: true, status: nextStatus, alreadyProcessed: true};
    }
    if (!transitions[rfq.status] || !transitions[rfq.status].includes(nextStatus)) {
      throw new Error('This RFQ status change is not allowed.');
    }
    if (one_('Transactions', {rfq_id: rfq.id})) {
      throw new Error('An existing supplier selection requires reconciliation.');
    }
    // Existing activity must not silently be turned back into review stage.
    if (nextStatus === 'NEEDS_INFORMATION' &&
        rows_('Matches').some(function (m) {
          return m.rfq_id === rfq.id &&
            (m.status === 'INVITED' || m.status === 'ACCEPTED');
        })) {
      throw new Error('Active supplier invitations must be resolved first.');
    }
    if (nextStatus === 'MATCHING') {
      buysonAdminActiveAccount_(rfq.buyer_id, 'BUYER');
    }
    buysonAdminPreflight_(['RFQs', 'Audit', 'Notifications']);
    const before = rfq.status;
    update_('RFQs', rfq.id, {status: nextStatus});
    const notes = [];
    if (nextStatus === 'NEEDS_INFORMATION') {
      notes.push({user: rfq.buyer_id, title: 'More details required',
        body: 'Your BUYSON request ' + rfq.ref + ' requires additional information.'});
    } else if (nextStatus === 'CANCELLED') {
      notes.push({user: rfq.buyer_id, title: 'Sourcing request closed',
        body: 'Your BUYSON request ' + rfq.ref + ' was cancelled.'});
      // Existing matches are retained for immutable history; later APIs block
      // interactions against CANCELLED requests.
    }
    const auditRecorded = buysonAdminAfterCommit_(actor.id, 'RFQ_REVIEWED',
      'RFQs', rfq.id, {from: before, to: nextStatus}, notes);
    return {ok: true, status: nextStatus, auditRecorded: auditRecorded};
  });
}

/** Manual supplier invitations (admin override of automatic matching):
 *  - buyer actively consents to sharing, has active account
 *  - RFQ open for matching and contains a valid positive requested quantity
 *  - every invited supplier is approved and owned by an ACTIVE SUPPLIER user
 *  - existing DECLINED entries are NEVER silently re-invited
 *  - existing INVITED/ACCEPTED entries never duplicate
 *  - max ten distinct active invitations per RFQ across all batches
 *  - validate the entire batch before first mutation
 *  - recovery: a retry can repair MATCHING => INVITED if an earlier append
 *    succeeded but updating the RFQ status failed
 * Manual routing does not assert the supplier has stock/capacity or delivery.
 */
function apiAdminMatch(token, rfqId, supplierIds) {
  admin_(token);
  const id = buysonAdminId_(rfqId);
  if (!Array.isArray(supplierIds) ||
      supplierIds.length < 1 || supplierIds.length > BUYSON_ADMIN_LIMITS_.MAX_MANUAL_SUPPLIERS) {
    throw new Error('Select between 1 and 10 suppliers.');
  }
  const ids = Array.from(new Set(supplierIds.map(buysonAdminId_)));
  return writeLocked_(function () {
    const actor = admin_(token);
    const rfq = one_('RFQs', {id: id});
    if (!rfq || !['MATCHING', 'INVITED', 'QUOTING'].includes(rfq.status)) {
      throw new Error('Admin must approve matching first.');
    }
    if (one_('Transactions', {rfq_id: id})) {
      throw new Error('Supplier already selected; matching is closed.');
    }
    if (!buysonAdminConsent_(rfq)) throw new Error('Supplier-sharing consent is required.');
    buysonAdminActiveAccount_(rfq.buyer_id, 'BUYER');
    const quantity = Number(rfq.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000000) {
      throw new Error('Invalid RFQ quantity.');
    }
    const category = one_('Categories', {id: rfq.category});
    if (!category || category.status !== 'ACTIVE') {
      throw new Error('RFQ category is not active.');
    }
    // Preflight all suppliers and current invitation history before ANY append.
    const suppliers = ids.map(function (supplierId) {
      const supplier = one_('Suppliers', {id: supplierId});
      if (!supplier || supplier.approval_status !== 'APPROVED') {
        throw new Error('One or more suppliers are not approved.');
      }
      buysonAdminActiveAccount_(supplier.user_id, 'SUPPLIER');
      return supplier;
    });
    const allMatches = rows_('Matches').filter(function (m) { return m.rfq_id === id; });
    const existingBySupplier = new Map();
    allMatches.forEach(function (m) {
      const key = String(m.supplier_id);
      if (existingBySupplier.has(key)) {
        throw new Error('Conflicting supplier invitations require manual reconciliation.');
      }
      existingBySupplier.set(key, m);
    });
    const fresh = suppliers.filter(function (supplier) {
      // DECLINED, INVITED and ACCEPTED all count as existing decisions.
      return !existingBySupplier.has(String(supplier.id));
    });
    const activeCount = allMatches.filter(function (m) {
      return m.status === 'INVITED' || m.status === 'ACCEPTED';
    }).length;
    if (activeCount + fresh.length > BUYSON_ADMIN_LIMITS_.MAX_MANUAL_SUPPLIERS) {
      throw new Error('Maximum of 10 active supplier invitations per RFQ.');
    }
    buysonAdminPreflight_(['RFQs', 'Matches', 'Audit', 'Notifications']);
    const inserted = [];
    fresh.forEach(function (supplier) {
      inserted.push({match: insert_('Matches', {
        rfq_id: id, supplier_id: supplier.id, status: 'INVITED'
      }), supplier: supplier});
    });
    // Repair a partial earlier write when some invitations were appended but
    // RFQ remained MATCHING. Such existing invites do NOT notify twice.
    const needsStatus = rfq.status === 'MATCHING' && (inserted.length || activeCount > 0);
    if (needsStatus) update_('RFQs', id, {status: 'INVITED'});
    if (!inserted.length && !needsStatus) return {ok: true, added: 0};
    const notes = inserted.map(function (item) {
      return {user: item.supplier.user_id, title: 'New sourcing request',
        body: 'You were invited to quote on BUYSON RFQ ' + rfq.ref};
    });
    const auditRecorded = buysonAdminAfterCommit_(actor.id, 'SUPPLIERS_MATCHED',
      'RFQs', id, {added: inserted.length, supplier_ids: inserted.map(function (item) {
        return item.supplier.id;
      })}, notes);
    return {ok: true, added: inserted.length, auditRecorded: auditRecorded};
  });
}

/** Additional administrative control, not yet wired to File 03. Suspends or
 * restores buyer/supplier accounts only. No role, ownership or email mutation.
 * Admin accounts require a separately governed recovery / MFA workflow. */
function apiAdminSetAccountStatus(token, userId, nextStatus) {
  admin_(token);
  const id = buysonAdminId_(userId);
  if (nextStatus !== 'ACTIVE' && nextStatus !== 'SUSPENDED') {
    throw new Error('Choose ACTIVE or SUSPENDED.');
  }
  return writeLocked_(function () {
    const actor = admin_(token);
    const target = one_('Users', {id: id});
    if (!target) throw new Error('Account not found.');
    if (target.id === actor.id || target.role === 'ADMIN') {
      throw new Error('Administrator accounts cannot be changed through this endpoint.');
    }
    if (target.role !== 'BUYER' && target.role !== 'SUPPLIER') {
      throw new Error('Unknown account role; contact support.');
    }
    if (target.status === nextStatus) {
      return {ok: true, status: nextStatus, alreadyProcessed: true};
    }
    if (target.status !== 'ACTIVE' && target.status !== 'SUSPENDED') {
      throw new Error('Unknown account state; contact support.');
    }
    buysonAdminPreflight_(['Users', 'Audit', 'Notifications']);
    const before = target.status;
    update_('Users', id, {status: nextStatus});
    const auditRecorded = buysonAdminAfterCommit_(actor.id, 'ACCOUNT_STATUS_CHANGED',
      'Users', id, {from: before, to: nextStatus}, [
        {user: id, title: 'BUYSON account status changed',
          body: 'Your BUYSON account status is now ' + nextStatus + '.'}
      ]);
    return {ok: true, status: nextStatus, auditRecorded: auditRecorded};
  });
}

/** Read-only admin audit listing with strict pagination. Exposes action types,
 * actor IDs and timestamps but deliberately omits raw JSON details and any
 * sessions/tokens. File 03 has no UI for this new optional endpoint yet. */
function apiAdminAuditLog(token, query) {
  admin_(token);
  const p = query === undefined || query === null ? {} : query;
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    throw new Error('Invalid audit query.');
  }
  const offset = p.offset === undefined ? 0 : Number(p.offset);
  const limit = p.limit === undefined ? 30 : Number(p.limit);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > BUYSON_ADMIN_LIMITS_.AUDIT_SCAN_MAX ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > BUYSON_ADMIN_LIMITS_.AUDIT_PAGE_MAX) {
    throw new Error('Invalid audit pagination.');
  }
  const allowedKeys = ['offset', 'limit'];
  if (Object.keys(p).some(function (k) { return !allowedKeys.includes(k); })) {
    throw new Error('Invalid audit query.');
  }
  const audit = rows_('Audit');
  // Dataset ordering is append-only; we return newest-first without sorting
  // untrusted timestamps. This endpoint is for operational visibility, not
  // for complete legal audit preservation or immutable external logs.
  const items = audit.slice().reverse().slice(offset, offset + limit).map(function (a) {
    return {id: a.id, actor_id: a.actor_id, event: a.event,
      entity: a.entity, entity_id: a.entity_id, created_at: a.created_at};
  });
  return {ok: true, items: items,
    nextOffset: offset + limit < audit.length ? offset + limit : null};
}
