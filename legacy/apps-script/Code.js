/**
 * BUYSON | FILE 04 — Code.gs
 * Production-minded web entry point, public catalogue response, authenticated
 * workspace response, and read-only deployment diagnostics.
 *
 * COMPATIBILITY CONTRACT
 * - Requires the unchanged Config.gs, Database.gs, Security.gs, Account.gs,
 *   Catalog.gs, Discovery.gs, and remaining BUYSON RC3 business modules.
 * - Supports File 01 Styles.html, File 02 Index.html, and File 03 Client.html.
 * - Preserves ALL original public API names, parameter order and response keys.
 * - Does not create, migrate, delete, or write any database rows.
 * - Does not change session tokens, user IDs, roles, schema, or Script Properties.
 * - No external dependencies or new Google authorization scopes.
 *
 * IMPORTANT: Apps Script web-app deployment identity must be independently
 * reviewed in appsscript.json and the deployment settings. A private Sheets
 * database is generally not accessible when the app executes as an unrelated
 * guest's Google account. Do not change deployment identity blindly.
 */

/**
 * Serve the canonical branded HTML template.
 * Apps Script evaluates <?!= include_('Styles'); ?> and
 * <?!= include_('Client'); ?> in Index.html before serving the response.
 * The private spreadsheet is never embedded in this HTML response.
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('BUYSON — Buy Smart. Grow Big. | Philippine B2B Marketplace')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * HTML template helper. Internal-only: trailing underscore prevents the
 * browser google.script.run interface from invoking it as an RPC endpoint.
 * Reject user-controlled or unexpected filenames.
 */
function include_(file) {
  if (file !== 'Styles' && file !== 'Client') {
    throw new Error('Invalid template include.');
  }
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

/** Public, explicitly allowlisted supplier fields. Never include legal names,
 * contact emails, account identity, verification evidence, or private records. */
function publicSupplier_(supplier) {
  return {
    id: supplier.id,
    business_name: supplier.business_name,
    category: supplier.category,
    city: supplier.city,
    province: supplier.province,
    description: supplier.description,
    moq: Number(supplier.moq),
    lead_days: Number(supplier.lead_days),
    approval_status: supplier.approval_status
  };
}

/**
 * Guest public data. An administrator's approval is required before a
 * company or product can appear. Price/lead-time values are indicative.
 * Response structure remains unchanged for File 03 Client.html.
 */
function apiPublic() {
  const categories = rows_('Categories')
    .filter(function (category) { return category.status === 'ACTIVE'; })
    .map(function (category) {
      return {id: category.id, slug: category.slug, name: category.name};
    });
  const suppliers = rows_('Suppliers')
    .filter(function (supplier) { return supplier.approval_status === 'APPROVED'; })
    .map(publicSupplier_);
  return {
    app: {
      name: T.NAME,
      version: '1.4.0-file04',
      category: 'Custom packaging'
    },
    categories: categories,
    suppliers: suppliers,
    catalog: apiMarketplacePublic()
  };
}

/**
 * Return only the signed-in user's permitted workspace records.
 *
 * BUYER: owns the RFQ, and can compare offers from suppliers matched to it.
 * SUPPLIER: has a non-declined match; its own quotes, messages, offers, and
 *           transaction records only. A declined match never grants read
 *           access, even when an unrelated client retains an old RFQ ID.
 * ADMIN: authorized operator; business records returned for moderation.
 *
 * Do not make this endpoint return raw Users, Sessions, AuthCodes or Audit rows.
 * Every mutating endpoint remains responsible for its own server-side checks.
 */
function apiBootstrap(token) {
  // This server-side session is the sole source of identity and role.
  const user = session_(token);
  const role = user.role;
  if (role !== 'BUYER' && role !== 'SUPPLIER' && role !== 'ADMIN') {
    throw new Error('Account role is not supported.');
  }

  // Sheets tables are each loaded once per request. Derive permissions before
  // including anything in the response; never rely on a frontend filter.
  const allRfqs = rows_('RFQs');
  const allMatches = rows_('Matches');
  const allQuotes = rows_('Quotes');
  const allSuppliers = rows_('Suppliers');

  let allowedRfqs = [];
  let allowedMatches = [];
  let supplier = null;

  if (role === 'BUYER') {
    allowedRfqs = allRfqs.filter(function (rfq) {
      return rfq.buyer_id === user.id;
    });
  } else if (role === 'SUPPLIER') {
    supplier = allSuppliers.find(function (record) {
      return record.user_id === user.id;
    }) || null;

    if (supplier) {
      allowedMatches = allMatches.filter(function (match) {
        return match.supplier_id === supplier.id && match.status !== 'DECLINED';
      });
      const matchedIds = new Set(allowedMatches.map(function (match) {
        return match.rfq_id;
      }));
      allowedRfqs = allRfqs.filter(function (rfq) {
        return matchedIds.has(rfq.id);
      });
    }
  } else { // ADMIN
    allowedRfqs = allRfqs;
  }

  const permittedRfqIds = new Set(allowedRfqs.map(function (rfq) {
    return rfq.id;
  }));

  if (role !== 'SUPPLIER') {
    allowedMatches = allMatches.filter(function (match) {
      return permittedRfqIds.has(match.rfq_id);
    });
  }

  const allowedQuotes = allQuotes.filter(function (quote) {
    return permittedRfqIds.has(quote.rfq_id) &&
      (role !== 'SUPPLIER' || (supplier && quote.supplier_id === supplier.id));
  });
  const permittedQuoteIds = new Set(allowedQuotes.map(function (quote) {
    return quote.id;
  }));

  const allowedOffers = rows_('Offers').filter(function (offer) {
    return permittedRfqIds.has(offer.rfq_id) &&
      permittedQuoteIds.has(offer.quote_id) &&
      (role !== 'SUPPLIER' || (supplier && offer.supplier_id === supplier.id));
  });

  const allowedMessages = rows_('Messages').filter(function (message) {
    return permittedRfqIds.has(message.rfq_id) &&
      (role !== 'SUPPLIER' || (supplier && message.supplier_id === supplier.id));
  });

  const allowedTransactions = rows_('Transactions').filter(function (transaction) {
    return permittedRfqIds.has(transaction.rfq_id) &&
      (role !== 'SUPPLIER' ||
        (supplier && transaction.supplier_id === supplier.id));
  });

  const suppliersPublic = allSuppliers
    .filter(function (record) { return record.approval_status === 'APPROVED'; })
    .map(publicSupplier_);

  // Admin can inspect onboarding details without authentication secrets.
  const suppliersForRole = role === 'ADMIN'
    ? allSuppliers.map(function (record) {
        return Object.assign({}, publicSupplier_(record), {
          user_id: record.user_id,
          legal_name: record.legal_name,
          approval_status: record.approval_status
        });
      })
    : suppliersPublic;

  return {
    user: safeUser_(user),
    account: accountProfileFor_(user),
    supplier: supplier,
    suppliers: suppliersForRole,
    categories: rows_('Categories')
      .filter(function (category) { return category.status === 'ACTIVE'; })
      .map(function (category) {
        return {id: category.id, slug: category.slug, name: category.name};
      }),
    rfqs: allowedRfqs,
    matches: allowedMatches,
    quotes: allowedQuotes,
    offers: allowedOffers,
    transactions: allowedTransactions,
    messages: allowedMessages,
    notifications: rows_('Notifications')
      .filter(function (notification) { return notification.user_id === user.id; })
      .slice(-40)
      .reverse(),
    marketplace: apiMarketplaceWorkspace(token),
    discovery: role === 'SUPPLIER' ? apiSupplierDiscoveryProfile(token) : null,
    counts: {
      rfqs: allowedRfqs.length,
      quotes: allowedQuotes.length,
      transactions: allowedTransactions.length
    },
    users: role === 'ADMIN' ? rows_('Users').map(safeUser_) : []
  };
}

// ---------------------------------------------------------------------------
// Read-only debugging tools. Run in the Apps Script editor with account-owner
// permissions. They do NOT change data or return source, tokens, or secrets.
// ---------------------------------------------------------------------------

/** A focused backend health report; reads only public catalogue tables. */
function diagnoseBuysonLoading() {
  Logger.log('=== BUYSON BACKEND DIAGNOSTIC ===');
  const checks = [
    {name: 'Database connection', run: function () { db_().getName(); }},
    {name: 'Categories', run: function () { rows_('Categories'); }},
    {name: 'Suppliers', run: function () { rows_('Suppliers'); }},
    {name: 'Products', run: function () { marketRows_('Products'); }},
    {name: 'Promotions', run: function () { marketRows_('Promotions'); }},
    {name: 'Public API contract', run: function () {
      const data = apiPublic();
      if (!data.app || !Array.isArray(data.categories) ||
          !Array.isArray(data.suppliers) || !data.catalog ||
          !Array.isArray(data.catalog.products) ||
          !Array.isArray(data.catalog.promotions)) {
        throw new Error('Public API contract mismatch.');
      }
    }}
  ];
  let passed = 0;
  checks.forEach(function (check) {
    const began = Date.now();
    try {
      check.run();
      passed++;
      Logger.log('PASS: ' + check.name + ' (' + (Date.now() - began) + 'ms)');
    } catch (error) {
      Logger.log('FAIL: ' + check.name + ' (' + (Date.now() - began) + 'ms)');
      // Avoid logging database identifiers, private data, or raw exceptions.
      throw new Error('BUYSON check failed: ' + check.name + '. See editor logs.');
    }
  });
  Logger.log('BACKEND DIAGNOSTIC: ' + passed + '/' + checks.length + ' passed.');
}

/**
 * Compiles the JavaScript inside the actual Client.html AND evaluated Index.
 * This is the exact class of test that caught the historic endless-loader
 * syntax failure. No code runs; new Function only parses each script body.
 */
function diagnoseBuysonFrontendSyntax() {
  Logger.log('=== BUYSON FRONTEND SYNTAX DIAGNOSTIC ===');
  const client = HtmlService.createHtmlOutputFromFile('Client').getContent();
  const rendered = doGet().getContent();
  const pages = [
    {label: 'Client.html', html: client},
    {label: 'Evaluated Index.html', html: rendered}
  ];
  let checked = 0;
  let failures = 0;
  pages.forEach(function (page) {
    // Inline script types are JavaScript in this project. Keep regex aligned
    // with the actual `<script> ... </script>` format used by Files 02–03.
    const pattern = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
    let match;
    let localCount = 0;
    while ((match = pattern.exec(page.html)) !== null) {
      localCount++;
      checked++;
      try {
        new Function(match[1]); // parse only; never execute script
        Logger.log('PASS: ' + page.label + ' script ' + localCount);
      } catch (error) {
        failures++;
        Logger.log('FAIL: ' + page.label + ' script ' + localCount +
          ' — ' + String(error && error.message || 'Invalid JavaScript').slice(0, 160));
      }
    }
    if (!localCount) {
      failures++;
      Logger.log('FAIL: ' + page.label + ' has no script blocks.');
    }
  });
  if (rendered.indexOf('<?!=') !== -1 || rendered.indexOf('<? ') !== -1) {
    failures++;
    Logger.log('FAIL: Unprocessed HTML template directive in evaluated page.');
  }
  Logger.log('SCRIPT CHECKS: ' + checked + '; FAILURES: ' + failures);
  if (failures) {
    throw new Error('BUYSON frontend syntax diagnostic failed.');
  }
  Logger.log('BUYSON FRONTEND SYNTAX: PASS');
}

/**
 * Show deployment source parity without showing customer data.
 * A build signature missing here means the File 03 code is not the installed
 * source (or an older version was pasted into the current Apps Script project).
 */
function verifyBuysonFrontendFiles() {
  const index = HtmlService.createHtmlOutputFromFile('Index').getContent();
  const styles = HtmlService.createHtmlOutputFromFile('Styles').getContent();
  const client = HtmlService.createHtmlOutputFromFile('Client').getContent();
  const results = {
    file01Styles: styles.indexOf('--bison-') !== -1,
    file02Index: index.indexOf('buysonShellBootstrap') !== -1 &&
      index.indexOf('buysonOfficialLogoAssets') !== -1,
    file03Client: client.indexOf('BUYSON SIGNATURE EDITION') !== -1 &&
      client.indexOf('initializeBuyson') !== -1,
    expectedIncludes: index.indexOf("include_('Styles')") !== -1 &&
      index.indexOf("include_('Client')") !== -1,
    navigationTargets: ['brandLink', 'topNav', 'accountSlot', 'root', 'toast']
      .every(function (id) { return index.indexOf('id="' + id + '"') !== -1; })
  };
  Object.keys(results).forEach(function (key) {
    Logger.log((results[key] ? 'PASS: ' : 'FAIL: ') + key);
  });
  if (Object.keys(results).some(function (key) { return !results[key]; })) {
    throw new Error('BUYSON file versions are inconsistent.');
  }
  Logger.log('BUYSON FILE 01–03 COMPATIBILITY: PASS');
}

// Compatibility aliases preserve earlier editor instructions without exposing
// new browser APIs. Legacy debug names intentionally do not retain old checks.
function diagnoseTulayLoading() { return diagnoseBuysonLoading(); }
function diagnoseTulayFrontendSyntax() { return diagnoseBuysonFrontendSyntax(); }
function verifyTulayClientFile() { return verifyBuysonFrontendFiles(); }
function inspectTulayClientSource() { return verifyBuysonFrontendFiles(); }
