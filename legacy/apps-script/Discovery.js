/**
 * BUYSON | FILE 12 — Discovery.gs
 * Explainable marketplace search, supplier opt-in routing and RFQ matching.
 *
 * DROP-IN CONTRACT: preserves DISCOVERY_SCHEMA (including exact column order),
 * DISCOVERY_LIMITS, DISCOVERY_SYNONYMS, all legacy helper/public function names,
 * argument order and public return keys. Requires Files 04–11. Existing Sheets,
 * sessions, supplier IDs, RFQs, matches and historic matching runs are unchanged.
 *
 * SAFETY: approved + active supplier, approved listing + active category,
 * explicit opt-in/declared delivery area, consent, category and quantity checks.
 * Matching is NOT a stock, shipping, verification or fulfillment guarantee.
 * Call autoMatchSubmittedRfq_ only WITHIN the caller's writeLocked_ scope.
 */
const DISCOVERY_SCHEMA = Object.freeze({
  SupplierDiscovery: ['id','supplier_id','auto_invites','delivery_areas_json','keywords','maximum_quantity','created_at','updated_at'],
  MatchingRuns: ['id','rfq_id','trigger','result','invited_count','candidate_count','explanation','created_at']
});
const DISCOVERY_LIMITS = Object.freeze({searchResults:24,autoInvites:5,maxCatalogRows:1500,rfqsPerBuyerDay:5});
const DISCOVERY_SYNONYMS = Object.freeze({
  pouch:['pouch','pouches','sachet','sachets','bag','bags','flexible packaging','coffee pouch','zipper pouch'],
  box:['box','boxes','carton','cartons','mailer','mailers','corrugated','packaging box'],
  bottle:['bottle','bottles','jar','jars','container','containers','cosmetic bottle'],
  label:['label','labels','sticker','stickers','adhesive','print labels'],
  cup:['cup','cups','takeout','food container','tub','tubs'],
  paper:['paper bag','paper bags','kraft bag','shopping bag']
});

/** Historical installer for isolated new/staging databases ONLY. Check both
 * pre-existing headers before creating missing tables; never overwrite data. */
function INSTALL_DISCOVERY_V12() {
  marketSheet_('Products');
  return writeLocked_(function () {
    const book = db_();
    Object.keys(DISCOVERY_SCHEMA).forEach(function (name) {
      const sh = book.getSheetByName(name);
      if (sh && sh.getLastRow() > 0) discoveryAssertSchema_(name,sh);
    });
    Object.keys(DISCOVERY_SCHEMA).forEach(function (name) {
      const cols = DISCOVERY_SCHEMA[name];
      let sh = book.getSheetByName(name);
      if (!sh) sh = book.insertSheet(name);
      if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
      if (sh.getLastRow() === 0) {
        sh.getRange(1,1,1,cols.length).setValues([cols])
          .setBackground('#401077').setFontColor('#ffffff').setFontWeight('bold');
        sh.setFrozenRows(1);
      }
    });
    return {ok:true};
  });
}
function discoveryAssertSchema_(name,sh) {
  const fields = DISCOVERY_SCHEMA[name];
  if (!fields || !sh || sh.getLastRow() < 1 || sh.getMaxColumns() < fields.length) {
    throw new Error('Discovery schema mismatch: '+ name + '. No changes were made.');
  }
  const current = sh.getRange(1,1,1,fields.length).getValues()[0];
  if (fields.some(function (field,i) { return current[i] !== field; })) {
    throw new Error('Discovery schema mismatch: '+ name + '. No changes were made.');
  }
}
function discoverySheet_(name) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(DISCOVERY_SCHEMA,name)) {
    throw new Error('Unknown discovery table.');
  }
  const sh=db_().getSheetByName(name);
  if (!sh) throw new Error('Discovery tables unavailable; configure staging before use.');
  discoveryAssertSchema_(name,sh);
  return sh;
}
function discoveryRows_(name) {
  const sh=discoverySheet_(name),fields=DISCOVERY_SCHEMA[name],last=sh.getLastRow();
  if (last<2) return [];
  return sh.getRange(2,1,last-1,fields.length).getValues().filter(function (cells) {
    return !!cells[0];
  }).map(function (cells) {
    const item={};fields.forEach(function (key,i) {
      item[key]=cells[i] instanceof Date?cells[i].toISOString():cells[i];
    });return item;
  });
}
/** Only append from trusted backend code while holding writeLocked_. */
function discoveryInsert_(name,attrs) {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs) ||
      Object.keys(attrs).some(function (key) {return !DISCOVERY_SCHEMA[name] || !DISCOVERY_SCHEMA[name].includes(key);})) {
    throw new Error('Invalid discovery record.');
  }
  const sh=discoverySheet_(name);
  const item=Object.assign({id:uuid_(),created_at:now_(),updated_at:now_()},attrs);
  if (!item.id || discoveryRows_(name).some(function (r) {return String(r.id)===String(item.id);})) {
    throw new Error('Duplicate discovery record ID.');
  }
  if (name==='SupplierDiscovery' && discoveryRows_(name).some(function (r) {
    return String(r.supplier_id)===String(item.supplier_id);
  })) throw new Error('Supplier already has discovery preferences.');
  sh.appendRow(DISCOVERY_SCHEMA[name].map(function (key) {return cleanCell_(item[key]);}));
  return item;
}
function discoveryUpdate_(name,id,attrs) {
  if (name==='MatchingRuns') throw new Error('Matching history is immutable.');
  if (name!=='SupplierDiscovery' || !attrs || typeof attrs !== 'object' || Array.isArray(attrs) ||
      Object.keys(attrs).some(function (key) {
        return !DISCOVERY_SCHEMA[name].includes(key) || ['id','supplier_id','created_at'].includes(key);
      })) throw new Error('Invalid discovery update.');
  const sh=discoverySheet_(name),fields=DISCOVERY_SCHEMA[name],last=sh.getLastRow();
  if (last<2) throw new Error('Discovery record not found.');
  const ids=sh.getRange(2,1,last-1,1).getValues(),idx=ids.findIndex(function (r) {
    return String(r[0])===String(id);
  });
  if (idx<0) throw new Error('Discovery record not found.');
  const previous=sh.getRange(idx+2,1,1,fields.length).getValues()[0],item={};
  fields.forEach(function (key,i) {item[key]=previous[i];});
  Object.assign(item,attrs,{updated_at:now_()});
  sh.getRange(idx+2,1,1,fields.length).setValues([fields.map(function (key) {return cleanCell_(item[key]);})]);
  return item;
}

/** Normalize words and detect synonyms at word boundaries, never mid-word. */
function discoveryTokens_(input) {
  const normalized=String(input===null || input===undefined?'':input).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const padded=' '+normalized+' ';
  const stop=new Set(['i','we','need','want','looking','for','the','and','to','a','an','some','from','of','with','in','my','our','have','pcs','pieces','piece','units','unit','custom','customized','printed','php','pesos','please','per','at','on','preferably']);
  const words=normalized?normalized.split(' ').filter(function (s) {
    return s.length>=2 && !stop.has(s) && !/^[0-9]+$/.test(s);
  }):[];
  Object.keys(DISCOVERY_SYNONYMS).forEach(function (group) {
    if (DISCOVERY_SYNONYMS[group].some(function (phrase) {
      const term=phrase.replace(/[^a-z0-9]+/g,' ').trim();return padded.includes(' '+term+' ');
    })) words.push(group);
  });
  return Array.from(new Set(words)).slice(0,36);
}
function discoveryQuantity_(query) {
  const text=String(query||'').toLowerCase().replace(/,/g,'');
  const patterns=[/(\d+(?:\.\d+)?)\s*(k|thousand)?\s*(?:pcs|pieces|units|packets|bags|bottles|boxes)\b/,/\b(?:need|want|order|buy|about|around)\s+(\d+(?:\.\d+)?)\s*(k|thousand)?\b/];
  for (const pat of patterns) {
    const m=text.match(pat);
    if (m) {const n=Number(m[1])*(m[2]?1000:1);if(Number.isFinite(n)&&n>0&&n<=10000000)return n;}
  }
  const numbers=Array.from(text.matchAll(/\b(\d{2,8})(?:\s*(k|thousand))?\b/g))
    .filter(function (m) {return !/^\s*(?:g|kg|ml|l|cm|mm)\b/.test(text.slice(m.index+m[0].length));})
    .map(function (m) {return Number(m[1])*(m[2]?1000:1);})
    .filter(function (n) {return n>=50 && n<=10000000;});
  return numbers.length?Math.max.apply(null,numbers):null;
}
function discoveryNormalize_(raw) {
  const p=typeof raw==='string' || typeof raw==='number'?{query:raw}:(raw===null||raw===undefined?{}:raw);
  if (!p || typeof p!=='object' || Array.isArray(p)) throw new Error('Invalid discovery search.');
  const query=text_(p.query||'',240,false),tokens=discoveryTokens_(query);
  let quantity=discoveryQuantity_(query);
  if (p.quantity!=='' && p.quantity!==null && p.quantity!==undefined)quantity=positive_(p.quantity,'Quantity',10000000);
  const explicit=text_(p.location||'',100,false);
  let location=explicit.toLowerCase();
  if (!location) {
    const places=['metro manila','quezon city','manila','makati','pasig','taguig','valenzuela','cavite','laguna','bulacan','cebu','davao','pampanga'];
    const sentence=' '+query.toLowerCase().replace(/[^a-z0-9]+/g,' ')+' ';
    location=places.find(function (place) {return sentence.includes(' '+place+' ');})||'';
  }
  return {query:query,quantity:quantity,location:location,category:text_(p.category||'',100,false),tokens:tokens};
}
function discoveryActiveCategories_() {
  const byId=new Map(),byName=new Map();
  rows_('Categories').filter(function (c) {return c && c.status==='ACTIVE';}).forEach(function (c) {
    byId.set(String(c.id),c);byName.set(String(c.name||'').trim().toLowerCase(),c);
  });
  return {byId:byId,byName:byName};
}
/** Public visibility is stricter than supplier APPROVED alone; account and
 * category must remain active, and listings must remain approved. */
function discoveryListedSuppliers_() {
  const users=new Map(rows_('Users').filter(function (u) {
    return u && u.id && u.status==='ACTIVE' && u.role==='SUPPLIER';
  }).map(function (u) {return [String(u.id),u];}));
  const cats=discoveryActiveCategories_();
  const suppliers=rows_('Suppliers').filter(function (s) {
    return s && s.id && s.approval_status==='APPROVED' && users.has(String(s.user_id));
  });
  const byId=new Map(suppliers.map(function (s) {return [String(s.id),s];}));
  // Sort before applying the documented catalog scan ceiling so changing Sheet
  // row order does not change which 1500 products are considered.
  const listings=marketRows_('Products').filter(function (p) {
    return p && p.id && p.status==='APPROVED' && byId.has(String(p.supplier_id)) &&
      cats.byId.has(String(p.category_id)) && Number.isFinite(Number(p.moq)) && Number(p.moq)>0;
  }).sort(function (a,b) {return String(a.id).localeCompare(String(b.id));})
    .slice(0,DISCOVERY_LIMITS.maxCatalogRows);
  const prefs=new Map();discoveryRows_('SupplierDiscovery').forEach(function (p) {
    if (p && p.supplier_id && byId.has(String(p.supplier_id)) && !prefs.has(String(p.supplier_id))) {
      prefs.set(String(p.supplier_id),p);
    }
  });
  return {suppliers:suppliers,byId:byId,listings:listings,prefs:prefs,categories:cats};
}
function discoveryAreas_(pref) {
  if (!pref)return [];
  try {
    const json=JSON.parse(String(pref.delivery_areas_json||'[]'));
    return Array.isArray(json)?Array.from(new Set(json.filter(function (x) {
      return typeof x==='string' && x.length<=80;
    }).map(function (x) {return x.toLowerCase().trim().replace(/\s+/g,' ');}).filter(Boolean))).slice(0,20):[];
  } catch (_) {return [];}
}
/** Location score is a hint about supplier address only, not shipping terms. */
function discoveryLocationMatch_(product,supplier,search) {
  if (!search.location || !supplier)return false;
  const value=String(search.location).toLowerCase().trim();
  const city=String(supplier.city||'').toLowerCase().trim();
  const province=String(supplier.province||'').toLowerCase().trim();
  return !!value && (value===city && !!city || value===province && !!province);
}
function discoveryScoreFast_(p,s,req,cats) {
  if (!p || !s || !req || !Number.isFinite(Number(p.moq)) || Number(p.moq)<=0)return null;
  if (req.quantity!==null && Number(p.moq)>req.quantity)return null;
  if (req.category) {
    const name=typeof cats.get==='function'?cats.get(String(p.category_id)):cats[p.category_id];
    if (req.category!==p.category_id && req.category.toLowerCase()!==String(name||'').toLowerCase())return null;
  }
  const title=discoveryTokens_(p.title);
  const itemTokens=discoveryTokens_([p.title,p.description,s.description].join(' '));
  const common=req.tokens.filter(function (t) {return itemTokens.includes(t);});
  const inTitle=req.tokens.filter(function (t) {return title.includes(t);});
  if (req.tokens.length && !common.length && !inTitle.length && !req.category)return null;
  // Avoid showing a textually irrelevant result for a category-only coincidence
  // when the request contains specific product terms.
  if (req.tokens.length && !common.length && !inTitle.length && req.category)return null;
  const denom=Math.min(req.tokens.length||1,8);
  const score=Math.min(100,Math.round(12+45*common.length/denom+25*Math.min(1,inTitle.length/Math.min(req.tokens.length||1,3))+(req.category?10:0)+(req.quantity!==null?8:0)+(discoveryLocationMatch_(p,s,req)?5:0)));
  const reasons=[];
  if (common.length) reasons.push('Product description matches');
  if (req.quantity!==null) reasons.push('MOQ is within requested quantity');
  if (discoveryLocationMatch_(p,s,req)) reasons.push('Supplier location matches');
  if (req.category) reasons.push('Product category matches');
  return {score:score,reasons:reasons};
}
/** Anonymous search returns only safe public listing fields. */
function apiSmartSearch(input) {
  const request=discoveryNormalize_(input),data=discoveryListedSuppliers_();
  const catMap=new Map(Array.from(data.categories.byId.values()).map(function (c) {
    return [String(c.id),String(c.name)];
  }));
  const results=[];
  data.listings.forEach(function (p) {
    const supplier=data.byId.get(String(p.supplier_id));
    const scored=discoveryScoreFast_(p,supplier,request,catMap);
    if (!scored)return;
    const publicRecord=marketSafeProduct_(p,supplier);
    results.push(Object.assign({},publicRecord,{
      score:scored.score,reasons:scored.reasons,supplier_city:supplier.city||'',
      supplier_province:supplier.province||'',delivery_confirmed:false
    }));
  });
  results.sort(function (a,b) {return b.score-a.score||String(a.id).localeCompare(String(b.id));});
  return {query:request.query,parsed:{quantity:request.quantity,location:request.location,
    category:request.category,keywords:request.tokens},total:results.length,
    products:results.slice(0,DISCOVERY_LIMITS.searchResults),more:results.length>DISCOVERY_LIMITS.searchResults,
    disclaimer:'Matching is based on published supplier listing data, not confirmed stock, delivery eligibility, quality or final quotation.'};
}
function discoverySupplierAuthorized_(user) {
  const current=one_('Users',{id:user.id});
  if (!current || current.status!=='ACTIVE' || current.role!=='SUPPLIER')throw new Error('Account unavailable.');
  const supplier=supplierApproved_(current);
  if (!supplier || supplier.approval_status!=='APPROVED')throw new Error('Supplier account is awaiting approval.');
  return supplier;
}
function apiSupplierDiscoveryProfile(token) {
  const user=requireRole_(token,['SUPPLIER']);
  const supplier=one_('Suppliers',{user_id:user.id});
  if (!supplier)return {approved:false,preferences:null};
  const active=supplier.approval_status==='APPROVED';
  const pref=discoveryRows_('SupplierDiscovery').find(function (p) {return String(p.supplier_id)===String(supplier.id);});
  return {approved:active,preferences:pref?{
    autoInvites:String(pref.auto_invites)==='true',deliveryAreas:discoveryAreas_(pref),
    keywords:pref.keywords||'',maximumQuantity:pref.maximum_quantity===''?null:Number(pref.maximum_quantity)
  }:null};
}
/** Keep the frontend's existing comma-separated delivery-area input. */
function apiSupplierSaveDiscovery(token,details) {
  const user=requireRole_(token,['SUPPLIER']);
  const p=details||{};
  if (!p || typeof p!=='object' || Array.isArray(p))throw new Error('Invalid discovery settings.');
  const auto=p.autoInvites===true||p.autoInvites==='true'||p.autoInvites==='on';
  const rawAreas=p.deliveryAreas===null||p.deliveryAreas===undefined?'':p.deliveryAreas;
  if (typeof rawAreas!=='string')throw new Error('Invalid delivery areas.');
  const areas=Array.from(new Set(rawAreas.split(',').map(function (s) {
    return text_(s,80,false).toLowerCase().replace(/\s+/g,' ').trim();
  }).filter(Boolean)));
  if (areas.length>20)throw new Error('List up to 20 delivery areas, separated by commas.');
  if (auto && !areas.length)throw new Error('Declare delivery areas or nationwide before enabling automatic requests.');
  const keywords=text_(p.keywords||'',300,false);
  const capacity=p.maximumQuantity===''||p.maximumQuantity===null||p.maximumQuantity===undefined
    ?'':positive_(p.maximumQuantity,'Maximum order quantity',10000000);
  return writeLocked_(function () {
    const liveUser=requireRole_(token,['SUPPLIER']);
    const supplier=discoverySupplierAuthorized_(liveUser);
    const existing=discoveryRows_('SupplierDiscovery').filter(function (pref) {
      return String(pref.supplier_id)===String(supplier.id);
    });
    if (existing.length>1)throw new Error('Conflicting supplier discovery profiles; contact support.');
    const payload={auto_invites:auto,delivery_areas_json:JSON.stringify(areas),keywords:keywords,maximum_quantity:capacity};
    const record=existing.length?discoveryUpdate_('SupplierDiscovery',existing[0].id,payload):
      discoveryInsert_('SupplierDiscovery',Object.assign({supplier_id:supplier.id},payload));
    try {audit_(liveUser.id,'SUPPLIER_DISCOVERY_UPDATED','SupplierDiscovery',record.id,{auto_invites:auto,delivery_areas:areas});}
    catch (e) {discoveryNoncritical_('preferences audit',e);}
    return {ok:true,autoInvites:auto};
  });
}
/** Categories, opt-in, qty, delivery and product terms must all match.
 * This is a capability hint, not a shipment or availability promise. */
function discoveryEligibleForRfq_(r) {
  if (!r || !r.category || !r.id && !r.product)return [];
  const data=discoveryListedSuppliers_();
  if (!data.categories.byId.has(String(r.category)))return [];
  const qty=Number(r.quantity);
  if (!Number.isFinite(qty)||qty<=0||qty>10000000)return [];
  const terms=discoveryTokens_([r.product,r.description,r.specs].join(' '));
  if (!terms.length)return [];
  const city=String(r.city||'').toLowerCase().trim(),province=String(r.province||'').toLowerCase().trim();
  const hasDeadline=!!r.required_by;
  const due=hasDeadline?Date.parse(String(r.required_by)+'T23:59:59+08:00'):null;
  if (hasDeadline && (!Number.isFinite(due)||due<Date.now()))return [];
  const remainingDays=hasDeadline?Math.ceil((due-Date.now())/86400000):Infinity;
  const bestBySupplier=new Map();
  data.listings.forEach(function (p) {
    if (String(p.category_id)!==String(r.category))return;
    const supplier=data.byId.get(String(p.supplier_id)),pref=data.prefs.get(String(p.supplier_id));
    if (!supplier || !pref || String(pref.auto_invites)!=='true')return;
    const areas=discoveryAreas_(pref);
    if (!areas.includes('nationwide') && !(city && areas.includes(city)) && !(province && areas.includes(province)))return;
    // Corrupt stored quantities/capacity may not become a permissive default.
    const supplierMin=Number(supplier.moq);
    if (!Number.isFinite(supplierMin) || supplierMin<=0)return;
    const minQty=Math.max(Number(p.moq),supplierMin);
    if (qty<minQty)return;
    const max=pref.maximum_quantity;
    if (max!=='' && max!==null && max!==undefined) {
      const maxQty=Number(max);
      if (!Number.isFinite(maxQty) || maxQty<=0 || qty>maxQty)return;
    }
    const leadValue=p.lead_days!=='' && p.lead_days!==null && p.lead_days!==undefined
      ?p.lead_days:supplier.lead_days;
    const lead=leadValue==='' || leadValue===null || leadValue===undefined?0:Number(leadValue);
    if (!Number.isFinite(lead)||lead<0)return;
    if (lead>0 && lead>remainingDays)return;
    const tokens=discoveryTokens_([p.title,p.description,pref.keywords].join(' '));
    const matched=terms.filter(function (t) {return tokens.includes(t);}).length;
    if (!matched)return;
    const coverage=matched/Math.max(terms.length,1);
    const score=Math.round(1000*coverage)+Math.min(100,Math.round(qty/minQty))+Math.min(matched,20)*4;
    const old=bestBySupplier.get(String(supplier.id));
    if (!old || score>old.score || score===old.score && String(p.id)<String(old.product.id)) {
      bestBySupplier.set(String(supplier.id),{supplier:supplier,score:score,product:p,title:p.title});
    }
  });
  return Array.from(bestBySupplier.values()).sort(function (a,b) {
    return b.score-a.score||String(a.supplier.id).localeCompare(String(b.supplier.id));
  });
}
/** Buyer-only preview: no supplier owner email/phone/secret is returned. */
function apiPreviewSupplierMatches(token,input) {
  requireRole_(token,['BUYER']);
  const p=input||{};
  if (!p || typeof p!=='object'||Array.isArray(p))throw new Error('Invalid preview request.');
  const category=text_(p.category,100,true),quantity=positive_(p.quantity,'Quantity',10000000);
  const c=one_('Categories',{id:category});
  if (!c || c.status!=='ACTIVE')throw new Error('Choose an active category first.');
  const simulated={product:text_(p.product,160,true),description:text_(p.description||'',2500,false),
    specs:text_(p.specs||'',1800,false),category:category,quantity:quantity,
    city:text_(p.city||'',100,false),province:text_(p.province||'',100,false),
    required_by:isoDate_(p.required_by||'',false)};
  const matches=discoveryEligibleForRfq_(simulated).slice(0,DISCOVERY_LIMITS.autoInvites);
  return {matches:matches.map(function (x) {
    return {supplierId:x.supplier.id,name:x.supplier.business_name,product:x.title,
      city:x.supplier.city,province:x.supplier.province};
  }),explanation:matches.length?
    'These suppliers opted in and listed matching products, MOQ and delivery areas. Actual availability must be confirmed.':
    'No automatic matches yet. We will keep your RFQ for admin assistance; no supplier is falsely promised.'};
}
function discoveryConsent_(value) { return value===true || value==='true' || value==='TRUE'; }
function discoveryNoncritical_(stage,error) {
  try {Logger.log('BUYSON discovery post-commit '+stage+' warning: '+(error && error.name||'operation failed'));}catch (_) {}
}
/** Called inside Buyer/Admin writeLocked_. Re-read current RFQ, consent and
 * status. Treat accepted/declined invitations as immutable and never re-invite
 * declined suppliers. Cap total active invitations per RFQ across retries.
 */
function autoMatchSubmittedRfq_(rfq,trigger) {
  if (!rfq || !rfq.id)return {invited:0,reason:'Not eligible for routing'};
  const current=one_('RFQs',{id:rfq.id});
  if (!current || !discoveryConsent_(current.sharing_consent) ||
      !['UNDER_REVIEW','MATCHING','INVITED'].includes(current.status)) {
    return {invited:0,reason:'Not eligible for routing'};
  }
  const prior=rows_('Matches').filter(function (m) {return String(m.rfq_id)===String(current.id);});
  const seen=new Set(prior.map(function (m) {return String(m.supplier_id);}));
  const active=new Set(prior.filter(function (m) {
    return m.status==='INVITED'||m.status==='ACCEPTED';
  }).map(function (m) {return String(m.supplier_id);}));
  const candidates=discoveryEligibleForRfq_(current);
  let invited=0;
  const slots=Math.max(0,DISCOVERY_LIMITS.autoInvites-active.size);
  const selected=candidates.filter(function (x) {return !seen.has(String(x.supplier.id));}).slice(0,slots);
  selected.forEach(function (x) {
    // Inside the write lock, but recheck status before the irreversible insert.
    const supplier=one_('Suppliers',{id:x.supplier.id});
    const owner=supplier?one_('Users',{id:supplier.user_id}):null;
    const currentRfq=one_('RFQs',{id:current.id});
    const liveProduct=marketOne_('Products',x.product.id);
    const liveCategory=one_('Categories',{id:current.category});
    const livePref=discoveryRows_('SupplierDiscovery').find(function (p) {
      return String(p.supplier_id)===String(x.supplier.id);
    });
    if (!supplier || supplier.approval_status!=='APPROVED' ||
        !owner || owner.status!=='ACTIVE' || owner.role!=='SUPPLIER' ||
        !currentRfq || !discoveryConsent_(currentRfq.sharing_consent) ||
        !['UNDER_REVIEW','MATCHING','INVITED'].includes(currentRfq.status) ||
        !liveCategory || liveCategory.status!=='ACTIVE' ||
        !liveProduct || liveProduct.status!=='APPROVED' ||
        !livePref || String(livePref.auto_invites)!=='true' ||
        one_('Matches',{rfq_id:current.id,supplier_id:supplier.id}))return;
    insert_('Matches',{rfq_id:current.id,supplier_id:supplier.id,status:'INVITED'});
    invited++;active.add(String(supplier.id));
    try {notify_(supplier.user_id,'New matching sourcing request','You were invited to quote on '+current.ref);}
    catch (e) {discoveryNoncritical_('supplier notification',e);}
  });
  const total=active.size;
  const status=total?'INVITED':'MATCHING';
  if (current.status!==status) update_('RFQs',current.id,{status:status});
  const reason=total?'Suppliers have been invited automatically. Their acceptance and availability are not guaranteed.':
    'No opted-in supplier meets the specified product, quantity and delivery criteria; admin review required.';
  try {discoveryInsert_('MatchingRuns',{rfq_id:current.id,trigger:trigger,result:status,
    invited_count:invited,candidate_count:candidates.length,explanation:reason});}
  catch (e) {discoveryNoncritical_('matching history',e);}
  try {audit_(current.buyer_id,'RFQ_AUTOMATCH','RFQs',current.id,{invited:invited,candidates:candidates.length,status:status});}
  catch (e) {discoveryNoncritical_('matching audit',e);}
  return {invited:invited,total:total,status:status,reason:reason};
}
function apiAdminRetryAutoMatch(token,rfqId) {
  admin_(token);
  const id=text_(rfqId,100,true);
  return writeLocked_(function () {
    const admin=admin_(token),rfq=one_('RFQs',{id:id});
    if (!rfq || !['MATCHING','UNDER_REVIEW','INVITED'].includes(rfq.status)) {
      throw new Error('RFQ cannot be re-matched in this status.');
    }
    if (!discoveryConsent_(rfq.sharing_consent))throw new Error('Supplier-sharing consent is required.');
    const result=autoMatchSubmittedRfq_(rfq,'ADMIN_RETRY');
    try {audit_(admin.id,'ADMIN_RETRIED_AUTOMATCH','RFQs',rfq.id,{invited:result.invited});}
    catch (e) {discoveryNoncritical_('admin retry audit',e);}
    return result;
  });
}
/** Backward-compatible lightweight staging diagnostic. Does not install data. */
function testDiscoveryV12() {
  const cats=rows_('Categories'),products=marketRows_('Products');
  const search=apiSmartSearch({query:'5000 custom coffee pouches'});
  if (search.parsed.quantity!==5000 || !Array.isArray(search.products)) {
    throw new Error('Discovery parsing check failed.');
  }
  discoverySheet_('SupplierDiscovery');discoverySheet_('MatchingRuns');
  Logger.log('PASS: '+cats.length+' categories; '+products.length+' catalog records.');
  Logger.log('PASS: auto-invites require supplier opt-in, approval, active account and buyer consent.');
  return {ok:true};
}
