/**
 * Smart Market one-shot XLSX -> Firestore migration.
 * Usage:
 *   npm install
 *   cp .env.example .env.local   # fill Firebase Admin values
 *   node --env-file=.env.local scripts/migrate-from-xlsx.mjs "seed/Smart Market.xlsx"
 *
 * Safe to re-run: deterministic document IDs are used for master data.
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import admin from 'firebase-admin';

const input=process.argv[2]||'seed/Smart Market.xlsx';
if(!fs.existsSync(input)) throw new Error(`XLSX not found: ${input}`);
const projectId=process.env.FIREBASE_PROJECT_ID;
const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
const privateKey=(process.env.FIREBASE_PRIVATE_KEY||'').replace(/\\n/g,'\n');
if(!projectId||!clientEmail||!privateKey) throw new Error('Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY first.');
if(!admin.apps.length) admin.initializeApp({credential:admin.credential.cert({projectId,clientEmail,privateKey})});
const db=admin.firestore();
const wb=XLSX.readFile(input,{cellDates:true});
const rows=(name)=>{const ws=wb.Sheets[name];return ws?XLSX.utils.sheet_to_json(ws,{defval:null}).filter(r=>Object.values(r).some(v=>v!==null&&v!=='')):[]};
const str=v=>v==null?'':String(v).trim();
const num=v=>Number(v||0);
const bool=v=>v===true||String(v).toUpperCase()==='TRUE'||Number(v)===1;
const ts=v=>{if(!v)return null;const d=v instanceof Date?v:new Date(v);return Number.isNaN(d.getTime())?null:admin.firestore.Timestamp.fromDate(d)};
const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined));

const maps={
  Products:r=>({id:str(r.Product_ID),collection:'products',data:clean({productId:str(r.Product_ID),category:str(r.Category),name:str(r.Product_Name),pack:str(r.Pack_Size),unitPrice:num(r.Unit_Price),barcode:str(r.Barcode),scanCode:str(r.Scan_Code),qrUrl:str(r.QR_URL),imageUrl:str(r.Image_URL),stockQty:num(r.Stock_Qty),reorderLevel:num(r.Reorder_Level),isActive:bool(r.Is_Active),updatedAt:ts(r.Updated_At)||admin.firestore.FieldValue.serverTimestamp()})}),
  Trolleys:r=>({id:str(r.Trolley_ID),collection:'trolleys',data:clean({trolleyId:str(r.Trolley_ID),qrPayload:str(r.QR_Payload),qrUrl:str(r.QR_URL),status:str(r.Status)||'AVAILABLE',currentSessionId:str(r.Current_Session_ID),currentUid:str(r.Current_User_ID),lastCheckoutAt:ts(r.Last_Checkout_At),lastReturnedAt:ts(r.Last_Returned_At),updatedAt:ts(r.Last_Updated_At)||admin.firestore.FieldValue.serverTimestamp(),notes:str(r.Notes)})}),
  Users:r=>({id:str(r.User_ID),collection:'legacyUsers',data:{userId:str(r.User_ID),name:str(r.Name),phone:str(r.Phone),email:str(r.Email),role:str(r.Role),status:str(r.Status),createdAt:ts(r.Created_At)}}),
  Settings:r=>({id:str(r.Key),collection:'settings',data:{key:str(r.Key),value:r.Value,notes:str(r.Notes)}}),
  Sessions:r=>({id:str(r.Session_ID),collection:'sessions',data:{uid:str(r.User_ID),legacyUserId:str(r.User_ID),trolleyId:str(r.Trolley_ID),status:str(r.Status),closed:['COMPLETED','CANCELLED'].includes(str(r.Status)),orderId:str(r.Order_ID),createdAt:ts(r.Check_In_At),updatedAt:ts(r.Last_Activity_At),closedAt:ts(r.Check_Out_At),version:num(r.Version),closeReason:str(r.Close_Reason)}}),
  Orders:r=>({id:str(r.Order_ID),collection:'orders',data:{sessionId:str(r.Session_ID),trolleyId:str(r.Trolley_ID),uid:str(r.User_ID),legacyUserId:str(r.User_ID),subtotal:num(r.Subtotal),discount:num(r.Discount),tax:num(r.Tax),total:num(r.Grand_Total),paymentMethod:str(r.Payment_Method),paymentStatus:str(r.Payment_Status),orderStatus:str(r.Order_Status),createdAt:ts(r.Created_At),paidAt:ts(r.Paid_At),dispatchAt:ts(r.Dispatch_At),completedAt:ts(r.Completed_At),version:num(r.Version)}}),
  Payments:r=>({id:str(r.Payment_ID),collection:'payments',data:{orderId:str(r.Order_ID),method:str(r.Method),amount:num(r.Amount),status:str(r.Status),reference:str(r.Reference),confirmedBy:str(r.Collected_By),createdAt:ts(r.Created_At),confirmedAt:ts(r.Confirmed_At)}}),
  DispatchLog:r=>({id:str(r.Dispatch_ID),collection:'dispatchLog',data:{orderId:str(r.Order_ID),trolleyId:str(r.Trolley_ID),paymentCheck:str(r.Payment_Check),itemsCheck:str(r.Items_Check),approvedBy:str(r.Approved_By),status:str(r.Dispatch_Status),createdAt:ts(r.Created_At),returnedAt:ts(r.Returned_At),returnVerifiedBy:str(r.Return_Verified_By)}}),
  AuditLog:r=>({id:str(r.Event_ID),collection:'auditLog',data:{timestamp:ts(r.Timestamp),requestId:str(r.Request_ID),actorId:str(r.Actor_ID),actorRole:str(r.Actor_Role),entityType:str(r.Entity_Type),entityId:str(r.Entity_ID),action:str(r.Action),result:str(r.Result),details:str(r.Details)}})
};

async function writeBatch(records){
  for(let i=0;i<records.length;i+=400){
    const batch=db.batch();
    for(const x of records.slice(i,i+400)){
      if(!x.id)continue;batch.set(db.collection(x.collection).doc(x.id),x.data,{merge:true});
    }
    await batch.commit();
  }
}

const summary={};
for(const [sheet,mapper] of Object.entries(maps)){
  const source=rows(sheet);const records=source.map(mapper).filter(x=>x.id);await writeBatch(records);summary[sheet]=records.length;console.log(`✓ ${sheet}: ${records.length}`);
}

// CartItems are migrated into session subcollections to match runtime model.
const carts=rows('CartItems');
for(let i=0;i<carts.length;i+=400){const batch=db.batch();for(const r of carts.slice(i,i+400)){const sid=str(r.Session_ID),pid=str(r.Product_ID);if(!sid||!pid)continue;batch.set(db.collection('sessions').doc(sid).collection('cart').doc(pid),{productId:pid,qty:num(r.Quantity),unitPrice:num(r.Unit_Price),lineTotal:num(r.Line_Total),active:str(r.Status)!=='REMOVED',createdAt:ts(r.Added_At),updatedAt:ts(r.Updated_At)},{merge:true})}await batch.commit()}
summary.CartItems=carts.length;

await db.collection('_meta').doc('smartMarket').set({schemaVersion:'2.0-firestore',sourceFile:path.basename(input),migratedAt:admin.firestore.FieldValue.serverTimestamp(),counts:summary},{merge:true});
console.log('\nMigration complete.');console.table(summary);
