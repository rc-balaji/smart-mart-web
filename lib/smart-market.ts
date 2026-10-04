import {FieldValue, Timestamp} from 'firebase-admin/firestore';
import {db} from './firebase-admin';

type Obj=Record<string,any>;
const now=()=>Timestamp.now();
const code=(v:any)=>String(v??'').trim();
const money=(n:any)=>Math.round((Number(n||0)+Number.EPSILON)*100)/100;
const id=(p:string)=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,10).toUpperCase()}`;

async function productByCode(productCode:string){
  const d=db(); const x=code(productCode);
  for(const field of ['productId','scanCode','barcode']){
    const q=await d.collection('products').where(field,'==',x).limit(1).get();
    if(!q.empty)return {id:q.docs[0]!.id,...q.docs[0]!.data()} as Obj;
  }
  return null;
}
async function trolleyByCode(trolleyCode:string){
  const d=db(); const x=code(trolleyCode);
  for(const field of ['trolleyId','qrPayload']){
    const q=await d.collection('trolleys').where(field,'==',x).limit(1).get();
    if(!q.empty)return {id:q.docs[0]!.id,...q.docs[0]!.data()} as Obj;
  }
  return null;
}
async function activeSession(uid:string){
  const d=db();
  const lock=await d.collection('activeSessions').doc(uid).get();
  if(lock.exists && lock.data()?.sessionId){
    const s=await d.collection('sessions').doc(String(lock.data()!.sessionId)).get();
    if(s.exists && s.data()?.closed!==true) return {id:s.id,...s.data()} as Obj;
  }
  const q=await d.collection('sessions').where('uid','==',uid).where('closed','==',false).limit(1).get();
  if(q.empty)return null;
  const found={id:q.docs[0]!.id,...q.docs[0]!.data()} as Obj;
  await d.collection('activeSessions').doc(uid).set({sessionId:found.id,updatedAt:now()},{merge:true});
  return found;
}
async function buildState(uid:string){
  const s=await activeSession(uid); if(!s)return {session:null,cart:[],total:0,order:null};
  const itemsSnap=await db().collection('sessions').doc(s.id).collection('cart').where('active','==',true).get();
  const cart=itemsSnap.docs.map(d=>({cartItemId:d.id,...d.data()}));
  const total=money(cart.reduce((a:any,x:any)=>a+Number(x.lineTotal||0),0));
  let order:any=null;
  if(s.orderId){const od=await db().collection('orders').doc(s.orderId).get();if(od.exists)order={orderId:od.id,...od.data()}}
  return {session:{sessionId:s.id,trolleyId:s.trolleyId,status:s.status,orderId:s.orderId||''},cart,total,order};
}

export async function customerAction(uid:string,action:string,payload:Obj){
  const d=db();
  if(action==='STATE') return buildState(uid);

  if(action==='CLAIM_TROLLEY'){
    const trolley=await trolleyByCode(payload.trolleyCode);if(!trolley)throw new Error('Trolley not found');
    const existing=await activeSession(uid);if(existing)return buildState(uid);
    const sessionId=id('SES');
    await d.runTransaction(async tx=>{
      const tRef=d.collection('trolleys').doc(trolley.id);
      const activeRef=d.collection('activeSessions').doc(uid);
      const [t,a]=await Promise.all([tx.get(tRef),tx.get(activeRef)]);
      if(a.exists && a.data()?.sessionId)throw new Error('You already have an active trolley');
      if(!t.exists||t.data()?.status!=='AVAILABLE')throw new Error(`Trolley is ${t.data()?.status||'unavailable'}`);
      tx.set(d.collection('sessions').doc(sessionId),{uid,trolleyId:trolley.trolleyId,status:'ACTIVE',closed:false,orderId:'',createdAt:now(),updatedAt:now()});
      tx.set(activeRef,{sessionId,createdAt:now(),updatedAt:now()});
      tx.update(tRef,{status:'IN_USE',currentSessionId:sessionId,currentUid:uid,updatedAt:now()});
    });
    return buildState(uid);
  }

  const s=await activeSession(uid);if(!s)throw new Error('No active trolley session');
  if(action==='ADD_PRODUCT'){
    if(s.status!=='ACTIVE')throw new Error('Cart is locked');
    const p=await productByCode(payload.productCode);if(!p||p.isActive===false)throw new Error('Product not found or inactive');
    const ref=d.collection('sessions').doc(s.id).collection('cart').doc(p.productId);
    await d.runTransaction(async tx=>{
      const snap=await tx.get(ref);const current=snap.exists?Number(snap.data()?.qty||0):0;const qty=current+1;
      if(qty>20)throw new Error('Maximum quantity is 20');
      tx.set(ref,{productId:p.productId,name:p.name,pack:p.pack,qty,unitPrice:Number(p.unitPrice),lineTotal:money(qty*Number(p.unitPrice)),active:true,updatedAt:now()},{merge:true});
      tx.update(d.collection('sessions').doc(s.id),{updatedAt:now()});
    });
    return buildState(uid);
  }
  if(action==='CHANGE_QTY'){
    if(s.status!=='ACTIVE')throw new Error('Cart is locked');
    const qty=Math.max(0,Math.min(20,Number(payload.quantity||0)));const ref=d.collection('sessions').doc(s.id).collection('cart').doc(code(payload.cartItemId));
    await d.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw new Error('Cart item not found');const unit=Number(snap.data()?.unitPrice||0);tx.update(ref,{qty,lineTotal:money(qty*unit),active:qty>0,updatedAt:now()});});
    return buildState(uid);
  }
  if(action==='CHECKOUT'){
    if(s.status!=='ACTIVE')throw new Error('Checkout already started');
    const method=code(payload.method).toUpperCase();if(!['CASH','UPI','QR'].includes(method))throw new Error('Invalid payment method');
    const state=await buildState(uid);if(!state.cart.length||state.total<=0)throw new Error('Cart is empty');
    const orderId=id('ORD');
    await d.runTransaction(async tx=>{
      const sRef=d.collection('sessions').doc(s.id);const tRef=d.collection('trolleys').doc(s.trolleyId);const orderRef=d.collection('orders').doc(orderId);
      tx.set(orderRef,{sessionId:s.id,uid,trolleyId:s.trolleyId,total:state.total,paymentMethod:method,paymentStatus:'PENDING',orderStatus:'PAYMENT_PENDING',createdAt:now(),updatedAt:now()});
      tx.update(sRef,{status:'PAYMENT_PENDING',orderId,updatedAt:now()});
      tx.update(tRef,{status:'PAYMENT_PENDING',updatedAt:now()});
    });
    return buildState(uid);
  }
  throw new Error('Unsupported customer action');
}

export async function dashboard(){
  const [ts,os]=await Promise.all([db().collection('trolleys').get(),db().collection('orders').orderBy('createdAt','desc').limit(50).get()]);
  return {trolleys:ts.docs.map(x=>({id:x.id,...x.data()})),orders:os.docs.map(x=>({orderId:x.id,...x.data()}))};
}

export async function adminAction(action:string,p:Obj){
  const d=db();
  if(action==='CONFIRM_PAYMENT'){
    const orderId=code(p.orderId);const oRef=d.collection('orders').doc(orderId);
    await d.runTransaction(async tx=>{
      const o=await tx.get(oRef);if(!o.exists)throw new Error('Order not found');const data=o.data()!;
      if(data.paymentStatus==='PAID')return;
      tx.update(oRef,{paymentStatus:'PAID',orderStatus:'READY_FOR_DISPATCH',paidAt:now(),updatedAt:now()});
      tx.update(d.collection('sessions').doc(data.sessionId),{status:'PAID',updatedAt:now()});
      tx.update(d.collection('trolleys').doc(data.trolleyId),{status:'PAID',updatedAt:now()});
      tx.set(d.collection('payments').doc(id('PAY')),{orderId,method:data.paymentMethod,amount:data.total,status:'PAID',reference:code(p.reference),confirmedAt:now(),confirmedBy:'ADMIN'});
    });
    return {ok:true};
  }
  throw new Error('Unsupported admin action');
}

export async function dispatchAction(action:string,p:Obj){
  const d=db(); const trolley=await trolleyByCode(p.trolleyCode);if(!trolley)throw new Error('Trolley not found');
  const sessionId=trolley.currentSessionId;if(!sessionId)return {trolley,order:null};
  const s=await d.collection('sessions').doc(sessionId).get();const orderId=s.data()?.orderId;
  const o=orderId?await d.collection('orders').doc(orderId).get():null;const order=o?.exists?{orderId:o.id,...o.data()}:null;
  const cartSnap=await d.collection('sessions').doc(sessionId).collection('cart').where('active','==',true).get();
  const items=cartSnap.docs.map(doc=>({cartItemId:doc.id,...doc.data()}));
  if(action==='INSPECT')return {trolley,order,items};
  if(action==='DISPATCH'){
    if(!o?.exists||o.data()?.paymentStatus!=='PAID'||o.data()?.orderStatus!=='READY_FOR_DISPATCH')throw new Error('Do not dispatch: payment is not confirmed');
    const checkedItemIds=Array.isArray(p.checkedItemIds)?p.checkedItemIds.map(code):[];
    if(!items.length||items.some(item=>!checkedItemIds.includes(String(item.cartItemId))))throw new Error('Check every trolley item before dispatch');
    await d.runTransaction(async tx=>{tx.update(o.ref,{orderStatus:'DISPATCHED',dispatchAt:now(),updatedAt:now()});tx.update(s.ref,{status:'DISPATCHED',updatedAt:now()});tx.update(d.collection('trolleys').doc(trolley.id),{status:'RETURN_PENDING',updatedAt:now()});tx.set(d.collection('dispatchLog').doc(id('DSP')),{orderId:o.id,trolleyId:trolley.trolleyId,status:'DISPATCHED',createdAt:now()});});
    return {ok:true,orderId:o.id,trolleyId:trolley.trolleyId};
  }
  if(action==='RETURN'){
    if(!o?.exists||o.data()?.orderStatus!=='DISPATCHED')throw new Error('Dispatch must be completed first');
    await d.runTransaction(async tx=>{tx.update(o.ref,{orderStatus:'COMPLETED',completedAt:now(),updatedAt:now()});tx.update(s.ref,{status:'COMPLETED',closed:true,closedAt:now(),updatedAt:now()});tx.update(d.collection('trolleys').doc(trolley.id),{status:'AVAILABLE',currentSessionId:'',currentUid:'',lastReturnedAt:now(),updatedAt:now()});if(s.data()?.uid)tx.delete(d.collection('activeSessions').doc(String(s.data()!.uid)));});
    return {ok:true,trolleyId:trolley.trolleyId};
  }
  throw new Error('Unsupported dispatch action');
}

/* -------------------- Admin product master CRUD -------------------- */
export async function listProducts(search=''){
  const snap=await db().collection('products').orderBy('name').get();
  const q=code(search).toLowerCase();
  return snap.docs.map(x=>({id:x.id,...x.data()} as Obj)).filter((p:any)=>!q||[p.productId,p.name,p.category,p.pack,p.scanCode,p.barcode].some(v=>String(v||'').toLowerCase().includes(q)));
}

function normalizeProductPayload(p:Obj){
  const unitPrice=money(p.unitPrice);
  const stockQty=Math.max(0,Math.floor(Number(p.stockQty||0)));
  const reorderLevel=Math.max(0,Math.floor(Number(p.reorderLevel||0)));
  if(!code(p.name))throw new Error('Product name is required');
  if(unitPrice<0)throw new Error('Price cannot be negative');
  return {
    category:code(p.category),name:code(p.name),pack:code(p.pack),unitPrice,
    barcode:code(p.barcode),scanCode:code(p.scanCode),qrUrl:code(p.qrUrl),imageUrl:code(p.imageUrl),
    stockQty,reorderLevel,isActive:p.isActive!==false,updatedAt:now()
  };
}

async function nextProductId(){
  const snap=await db().collection('products').get();
  let max=0;
  snap.docs.forEach(d=>{const m=String(d.id).match(/^PRD(\d+)$/i);if(m)max=Math.max(max,Number(m[1]))});
  return `PRD${String(max+1).padStart(3,'0')}`;
}

export async function adminProductAction(action:string,p:Obj){
  const d=db();
  if(action==='CREATE_PRODUCT'){
    const productId=code(p.productId)||await nextProductId();
    const ref=d.collection('products').doc(productId);
    if((await ref.get()).exists)throw new Error(`Product ${productId} already exists`);
    const data=normalizeProductPayload({...p,scanCode:code(p.scanCode)||`SM-${productId}`});
    await ref.set({productId,...data,createdAt:now()});
    return {productId};
  }
  if(action==='UPDATE_PRODUCT'){
    const productId=code(p.productId);if(!productId)throw new Error('productId is required');
    const ref=d.collection('products').doc(productId);if(!(await ref.get()).exists)throw new Error('Product not found');
    await ref.update(normalizeProductPayload(p));return {productId};
  }
  if(action==='SET_STOCK'){
    const productId=code(p.productId);const stockQty=Math.max(0,Math.floor(Number(p.stockQty||0)));
    const ref=d.collection('products').doc(productId);if(!(await ref.get()).exists)throw new Error('Product not found');
    await ref.update({stockQty,updatedAt:now()});return {productId,stockQty};
  }
  if(action==='ADJUST_STOCK'){
    const productId=code(p.productId);const delta=Math.trunc(Number(p.delta||0));if(!delta)throw new Error('delta is required');
    const ref=d.collection('products').doc(productId);
    let stockQty=0;
    await d.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw new Error('Product not found');stockQty=Math.max(0,Number(snap.data()?.stockQty||0)+delta);tx.update(ref,{stockQty,updatedAt:now()})});
    return {productId,stockQty};
  }
  if(action==='DELETE_PRODUCT'){
    const productId=code(p.productId);if(!productId)throw new Error('productId is required');
    const ref=d.collection('products').doc(productId);if(!(await ref.get()).exists)throw new Error('Product not found');
    await ref.delete();return {productId,deleted:true};
  }
  if(action==='TOGGLE_PRODUCT'){
    const productId=code(p.productId);const ref=d.collection('products').doc(productId);const snap=await ref.get();if(!snap.exists)throw new Error('Product not found');
    const isActive=!Boolean(snap.data()?.isActive);await ref.update({isActive,updatedAt:now()});return {productId,isActive};
  }
  throw new Error('Unsupported product action');
}
