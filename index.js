/**
 * SMARK MART - ONE COMMAND XLSX -> FIRESTORE IMPORTER
 *
 * Usage:
 *   npm install
 *   node index.js
 *
 * Optional workbook path:
 *   node index.js "Smart Market.xlsx"
 *
 * Credentials (use ONE method):
 *   A) FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
 *   B) FIREBASE_SERVICE_ACCOUNT_BASE64='<base64-json>'
 *   C) GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/serviceAccountKey.json
 *   D) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *   E) place serviceAccountKey.json next to this file (local only; never commit it)
 *
 * Safe to re-run. Master records use deterministic Firestore document IDs.
 */

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const admin = require('firebase-admin');

const ROOT = __dirname;
const candidateInputs = [
  process.argv[2],
  path.join(ROOT, 'Smart Market.xlsx'),
  path.join(ROOT, 'seed', 'Smart Market.xlsx'),
].filter(Boolean);
const input = candidateInputs.find(p => fs.existsSync(p));
if (!input) {
  throw new Error('Smart Market.xlsx not found. Put it beside index.js or run: node index.js "path/to/Smart Market.xlsx"');
}

function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return admin.credential.cert(json);
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    return admin.credential.cert(json);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    return admin.credential.cert(JSON.parse(fs.readFileSync(p, 'utf8')));
  }
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }
  const local = path.join(ROOT, 'serviceAccountKey.json');
  if (fs.existsSync(local)) return admin.credential.cert(JSON.parse(fs.readFileSync(local, 'utf8')));
  throw new Error(
    'Firebase Admin credentials missing. Use FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_BASE64, GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or local serviceAccountKey.json.'
  );
}

if (!admin.apps.length) admin.initializeApp({ credential: getCredential() });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const wb = XLSX.readFile(input, { cellDates: true });
const sheetRows = name => {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })
    .filter(r => Object.values(r).some(v => v !== null && v !== ''));
};
const s = v => v == null ? '' : String(v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const b = v => v === true || String(v).toUpperCase() === 'TRUE' || Number(v) === 1;
const timestamp = v => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
};
const omitUndefined = obj => Object.fromEntries(Object.entries(obj).filter(([,v]) => v !== undefined));
const serverNow = () => FieldValue.serverTimestamp();

function normalizeProductRows() {
  const canonical = sheetRows('Products');
  if (canonical.length) return canonical;
  // Fallback for the original raw Sheet1 schema.
  return sheetRows('Sheet1').map((r, i) => ({
    Product_ID: `PRD${String(i + 1).padStart(3, '0')}`,
    Category: r.Category,
    Product_Name: r.Product,
    Pack_Size: r.Quantity,
    Unit_Price: r['Price (₹)'],
    Barcode: '',
    Scan_Code: `SM-PRD${String(i + 1).padStart(3, '0')}`,
    QR_URL: `https://quickchart.io/qr?text=${encodeURIComponent(`SM-PRD${String(i + 1).padStart(3, '0')}`)}`,
    Image_URL: '',
    Stock_Qty: 100,
    Reorder_Level: 10,
    Is_Active: true,
    Updated_At: new Date(),
  }));
}

async function commitRecords(records) {
  let written = 0;
  for (let i = 0; i < records.length; i += 400) {
    const batch = db.batch();
    for (const rec of records.slice(i, i + 400)) {
      if (!rec.id) continue;
      batch.set(db.collection(rec.collection).doc(rec.id), rec.data, { merge: true });
      written++;
    }
    await batch.commit();
  }
  return written;
}

async function migrateProducts() {
  const rows = normalizeProductRows();
  const records = rows.map(r => {
    const productId = s(r.Product_ID);
    return {
      id: productId,
      collection: 'products',
      data: omitUndefined({
        productId,
        category: s(r.Category),
        name: s(r.Product_Name),
        pack: s(r.Pack_Size),
        unitPrice: n(r.Unit_Price),
        barcode: s(r.Barcode),
        scanCode: s(r.Scan_Code) || `SM-${productId}`,
        qrUrl: s(r.QR_URL),
        imageUrl: s(r.Image_URL),
        stockQty: n(r.Stock_Qty),
        reorderLevel: n(r.Reorder_Level),
        isActive: r.Is_Active == null ? true : b(r.Is_Active),
        updatedAt: timestamp(r.Updated_At) || serverNow(),
        importedFrom: path.basename(input),
      })
    };
  }).filter(x => x.id);
  return commitRecords(records);
}

async function migrateTrolleys() {
  const rows = sheetRows('Trolleys');
  const records = rows.map(r => ({
    id: s(r.Trolley_ID), collection: 'trolleys', data: {
      trolleyId: s(r.Trolley_ID),
      qrPayload: s(r.QR_Payload),
      qrUrl: s(r.QR_URL),
      status: s(r.Status) || 'AVAILABLE',
      currentSessionId: s(r.Current_Session_ID),
      currentUid: s(r.Current_User_ID),
      lastCheckoutAt: timestamp(r.Last_Checkout_At),
      lastReturnedAt: timestamp(r.Last_Returned_At),
      updatedAt: timestamp(r.Last_Updated_At) || serverNow(),
      notes: s(r.Notes),
    }
  })).filter(x => x.id);
  return commitRecords(records);
}

async function migrateSimpleSheets() {
  const specs = [
    ['Users','legacyUsers','User_ID', r => ({userId:s(r.User_ID),name:s(r.Name),phone:s(r.Phone),email:s(r.Email),role:s(r.Role),status:s(r.Status),createdAt:timestamp(r.Created_At)})],
    ['Settings','settings','Key', r => ({key:s(r.Key),value:r.Value,notes:s(r.Notes),updatedAt:serverNow()})],
    ['Sessions','sessions','Session_ID', r => ({uid:s(r.User_ID),legacyUserId:s(r.User_ID),trolleyId:s(r.Trolley_ID),status:s(r.Status),closed:['COMPLETED','CANCELLED'].includes(s(r.Status)),orderId:s(r.Order_ID),createdAt:timestamp(r.Check_In_At),updatedAt:timestamp(r.Last_Activity_At),closedAt:timestamp(r.Check_Out_At),version:n(r.Version),closeReason:s(r.Close_Reason)})],
    ['Orders','orders','Order_ID', r => ({sessionId:s(r.Session_ID),trolleyId:s(r.Trolley_ID),uid:s(r.User_ID),legacyUserId:s(r.User_ID),subtotal:n(r.Subtotal),discount:n(r.Discount),tax:n(r.Tax),total:n(r.Grand_Total),paymentMethod:s(r.Payment_Method),paymentStatus:s(r.Payment_Status),orderStatus:s(r.Order_Status),createdAt:timestamp(r.Created_At),paidAt:timestamp(r.Paid_At),dispatchAt:timestamp(r.Dispatch_At),completedAt:timestamp(r.Completed_At),version:n(r.Version)})],
    ['Payments','payments','Payment_ID', r => ({orderId:s(r.Order_ID),method:s(r.Method),amount:n(r.Amount),status:s(r.Status),reference:s(r.Reference),confirmedBy:s(r.Collected_By),createdAt:timestamp(r.Created_At),confirmedAt:timestamp(r.Confirmed_At)})],
    ['DispatchLog','dispatchLog','Dispatch_ID', r => ({orderId:s(r.Order_ID),trolleyId:s(r.Trolley_ID),paymentCheck:s(r.Payment_Check),itemsCheck:s(r.Items_Check),approvedBy:s(r.Approved_By),status:s(r.Dispatch_Status),createdAt:timestamp(r.Created_At),returnedAt:timestamp(r.Returned_At),returnVerifiedBy:s(r.Return_Verified_By)})],
    ['AuditLog','auditLog','Event_ID', r => ({timestamp:timestamp(r.Timestamp),requestId:s(r.Request_ID),actorId:s(r.Actor_ID),actorRole:s(r.Actor_Role),entityType:s(r.Entity_Type),entityId:s(r.Entity_ID),action:s(r.Action),result:s(r.Result),details:s(r.Details)})],
  ];
  const counts = {};
  for (const [sheet, collection, idField, map] of specs) {
    const records = sheetRows(sheet).map(r => ({ id:s(r[idField]), collection, data:omitUndefined(map(r)) })).filter(x=>x.id);
    counts[sheet] = await commitRecords(records);
  }
  return counts;
}

async function migrateCartItems() {
  const rows = sheetRows('CartItems');
  const productMap = new Map(normalizeProductRows().map(r => [s(r.Product_ID), r]));
  let count = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    for (const r of rows.slice(i, i + 400)) {
      const sessionId=s(r.Session_ID), productId=s(r.Product_ID);
      if (!sessionId || !productId) continue;
      const p = productMap.get(productId) || {};
      batch.set(db.collection('sessions').doc(sessionId).collection('cart').doc(productId), {
        productId,
        name:s(p.Product_Name) || productId,
        pack:s(p.Pack_Size),
        qty:n(r.Quantity),
        unitPrice:n(r.Unit_Price),
        lineTotal:n(r.Line_Total),
        active:s(r.Status)!=='REMOVED',
        createdAt:timestamp(r.Added_At),
        updatedAt:timestamp(r.Updated_At) || serverNow(),
      }, {merge:true});
      count++;
    }
    await batch.commit();
  }
  return count;
}

async function rebuildActiveSessionLocks() {
  const open = await db.collection('sessions').where('closed','==',false).get();
  let count = 0;
  for (let i=0;i<open.docs.length;i+=400) {
    const batch=db.batch();
    for (const doc of open.docs.slice(i,i+400)) {
      const uid=s(doc.data().uid);
      if (!uid) continue;
      batch.set(db.collection('activeSessions').doc(uid), {sessionId:doc.id,updatedAt:serverNow()}, {merge:true});
      count++;
    }
    await batch.commit();
  }
  return count;
}

async function main() {
  console.log(`\nSmark Mart Firestore Import`);
  console.log(`Workbook: ${input}`);
  console.log(`Sheets: ${wb.SheetNames.join(', ')}\n`);

  const summary = {};
  summary.Products = await migrateProducts(); console.log(`✓ Products: ${summary.Products}`);
  summary.Trolleys = await migrateTrolleys(); console.log(`✓ Trolleys: ${summary.Trolleys}`);
  Object.assign(summary, await migrateSimpleSheets());
  for (const key of ['Users','Settings','Sessions','Orders','Payments','DispatchLog','AuditLog']) console.log(`✓ ${key}: ${summary[key] || 0}`);
  summary.CartItems = await migrateCartItems(); console.log(`✓ CartItems: ${summary.CartItems}`);
  summary.ActiveSessions = await rebuildActiveSessionLocks(); console.log(`✓ Active session locks: ${summary.ActiveSessions}`);

  await db.collection('_meta').doc('smarkMart').set({
    app:'Smark Mart', schemaVersion:'3.0-firestore-crud', sourceFile:path.basename(input),
    sheetNames:wb.SheetNames, counts:summary, migratedAt:serverNow()
  }, {merge:true});

  console.log('\n✅ Firestore import completed.');
  console.table(summary);
  console.log('\nExpected current workbook result: 40 products + 4 trolleys, plus Users/Settings and any existing transaction rows.');
}

main().catch(err => { console.error('\n❌ IMPORT FAILED\n', err); process.exit(1); });
