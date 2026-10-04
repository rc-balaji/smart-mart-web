import {FieldValue, Timestamp} from 'firebase-admin/firestore';
import {db} from './firebase-admin';

type Obj=Record<string,any>;
export class CustomerActionError extends Error{
  constructor(public readonly code:string,message:string){
    super(message);
    this.name='CustomerActionError';
  }
}
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
  const returnSnap=await db().collection('customerTrolleyReturns').doc(uid).get();
  const returnData=returnSnap.data();
  const trolleyReturn=returnSnap.exists&&returnData
    ?{trolleyId:code(returnData.trolleyId),status:code(returnData.status),reasonCode:code(returnData.reasonCode)}
    :null;
  const s=await activeSession(uid); if(!s)return {session:null,cart:[],total:0,order:null,...(trolleyReturn?{trolleyReturn}: {})};
  const itemsSnap=await db().collection('sessions').doc(s.id).collection('cart').where('active','==',true).get();
  const cart=itemsSnap.docs.map(d=>({cartItemId:d.id,...d.data()}));
  const total=money(cart.reduce((a:any,x:any)=>a+Number(x.lineTotal||0),0));
  let order:any=null;
  if(s.orderId){const od=await db().collection('orders').doc(s.orderId).get();if(od.exists)order={orderId:od.id,...od.data()}}
  return {session:{sessionId:s.id,trolleyId:s.trolleyId,status:s.status,orderId:s.orderId||''},cart,total,order,...(trolleyReturn?{trolleyReturn}: {})};
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
      tx.delete(d.collection('customerTrolleyReturns').doc(uid));
    });
    return buildState(uid);
  }

  if(action==='CANCEL_SESSION'){
    const reasonCode=code(payload.reasonCode).toUpperCase();
    if(!['CUSTOMER_CANCELLED','TROLLEY_DAMAGED','CUSTOMER_NEEDS_TO_LEAVE'].includes(reasonCode)){
      throw new CustomerActionError('SESSION_NOT_CANCELLABLE','Unsupported session cancellation reason');
    }
    const expectedSession=await activeSession(uid);
    if(!expectedSession)throw new CustomerActionError('SESSION_NOT_CANCELLABLE','There is no cancellable active session');
    let trolleyReturn:Obj|null=null;
    await d.runTransaction(async tx=>{
      const lockRef=d.collection('activeSessions').doc(uid);
      const lock=await tx.get(lockRef);
      const sessionId=code(lock.data()?.sessionId);
      if(sessionId!==expectedSession.id)throw new CustomerActionError('SESSION_NOT_CANCELLABLE','The active session has changed; refresh and try again');
      const sessionRef=sessionId?d.collection('sessions').doc(sessionId):null;
      const session=sessionRef?await tx.get(sessionRef):null;
      if(!session?.exists||session.data()?.uid!==uid||session.data()?.closed===true||session.data()?.status!=='ACTIVE'||code(session.data()?.orderId)){
        throw new CustomerActionError('SESSION_NOT_CANCELLABLE','There is no cancellable active session');
      }
      const sessionData=session.data()!;
      const trolleyQuery=await tx.get(d.collection('trolleys').where('trolleyId','==',code(sessionData.trolleyId)).limit(1));
      const trolleyRef=!trolleyQuery.empty?trolleyQuery.docs[0]!.ref:d.collection('trolleys').doc(code(sessionData.trolleyId));
      const trolley=!trolleyQuery.empty?trolleyQuery.docs[0]!:await tx.get(trolleyRef);
      if(!trolley.exists||trolley.data()?.currentSessionId!==sessionId){
        throw new CustomerActionError('SESSION_NOT_CANCELLABLE','The active trolley session could not be verified');
      }
      const trolleyId=code(trolley.data()?.trolleyId)||trolley.id;
      trolleyReturn={trolleyId,status:'RETURN_PENDING',reasonCode};
      tx.update(sessionRef!,{status:'CANCELLED',closed:true,closeReason:reasonCode,closedAt:now(),updatedAt:now()});
      tx.update(trolleyRef,{status:'RETURN_PENDING',returnReasonCode:reasonCode,returnCustomerUid:uid,returnCreatedAt:now(),updatedAt:now()});
      tx.delete(lockRef);
      tx.set(d.collection('customerTrolleyReturns').doc(uid),{...trolleyReturn,updatedAt:now()});
    });
    const state=await buildState(uid);
    return {...state,trolleyReturn};
  }

  if(action==='SWITCH_TROLLEY'){
    const newTrolleyCode=code(payload.newTrolleyCode);
    const reasonCode=code(payload.reasonCode).toUpperCase();
    if(!newTrolleyCode)throw new CustomerActionError('TROLLEY_UNAVAILABLE','New trolley code is required');
    if(!['TROLLEY_DAMAGED','CUSTOMER_CHANGED_TROLLEY'].includes(reasonCode)){
      throw new CustomerActionError('SESSION_NOT_CANCELLABLE','Unsupported trolley-switch reason');
    }
    const newTrolley=await trolleyByCode(newTrolleyCode);
    if(!newTrolley)throw new CustomerActionError('TROLLEY_UNAVAILABLE','Requested trolley is not available');
    const expectedSession=await activeSession(uid);
    if(!expectedSession)throw new CustomerActionError('SESSION_NOT_CANCELLABLE','There is no active session that can switch trolleys');
    let trolleyReturn:Obj|null=null;
    await d.runTransaction(async tx=>{
      const lockRef=d.collection('activeSessions').doc(uid);
      const lock=await tx.get(lockRef);
      const sessionId=code(lock.data()?.sessionId);
      if(sessionId!==expectedSession.id)throw new CustomerActionError('SESSION_NOT_CANCELLABLE','The active session has changed; refresh and try again');
      const sessionRef=sessionId?d.collection('sessions').doc(sessionId):null;
      const session=sessionRef?await tx.get(sessionRef):null;
      if(!session?.exists||session.data()?.uid!==uid||session.data()?.closed===true||session.data()?.status!=='ACTIVE'||code(session.data()?.orderId)){
        throw new CustomerActionError('SESSION_NOT_CANCELLABLE','There is no active session that can switch trolleys');
      }
      const sessionData=session.data()!;
      const oldTrolleyQuery=await tx.get(d.collection('trolleys').where('trolleyId','==',code(sessionData.trolleyId)).limit(1));
      const oldTrolleyRef=!oldTrolleyQuery.empty?oldTrolleyQuery.docs[0]!.ref:d.collection('trolleys').doc(code(sessionData.trolleyId));
      const oldTrolley=!oldTrolleyQuery.empty?oldTrolleyQuery.docs[0]!:await tx.get(oldTrolleyRef);
      const newTrolleyRef=d.collection('trolleys').doc(newTrolley.id);
      const [verifiedNewTrolley]=await Promise.all([tx.get(newTrolleyRef)]);
      if(!oldTrolley.exists||oldTrolley.data()?.currentSessionId!==sessionId||oldTrolley.data()?.status!=='IN_USE'){
        throw new CustomerActionError('SESSION_NOT_CANCELLABLE','The current trolley session could not be verified');
      }
      if(!verifiedNewTrolley.exists||verifiedNewTrolley.data()?.status!=='AVAILABLE'||newTrolleyRef.path===oldTrolleyRef.path){
        throw new CustomerActionError('TROLLEY_UNAVAILABLE','Requested trolley is not available');
      }
      const oldTrolleyId=code(oldTrolley.data()?.trolleyId)||oldTrolley.id;
      const newTrolleyId=code(verifiedNewTrolley.data()?.trolleyId)||verifiedNewTrolley.id;
      trolleyReturn={trolleyId:oldTrolleyId,status:'RETURN_PENDING',reasonCode};
      tx.update(oldTrolleyRef,{status:'RETURN_PENDING',currentSessionId:'',currentUid:'',returnReasonCode:reasonCode,returnCustomerUid:uid,returnCreatedAt:now(),updatedAt:now()});
      tx.update(newTrolleyRef,{status:'IN_USE',currentSessionId:sessionId,currentUid:uid,updatedAt:now()});
      tx.update(sessionRef!,{trolleyId:newTrolleyId,updatedAt:now()});
      tx.set(d.collection('customerTrolleyReturns').doc(uid),{...trolleyReturn,updatedAt:now()});
    });
    const state=await buildState(uid);
    return {...state,trolleyReturn};
  }

  if(action==='CANCEL_ORDER'){
    const orderId=code(payload.orderId);
    const reasonCode=code(payload.reasonCode).toUpperCase();
    if(!orderId||!['CUSTOMER_CANCELLED','TROLLEY_DAMAGED','CUSTOMER_NEEDS_TO_LEAVE'].includes(reasonCode)){
      throw new CustomerActionError('ORDER_NOT_CANCELLABLE','Order ID and a supported cancellation reason are required');
    }
    let trolleyReturn:Obj|null=null;
    await d.runTransaction(async tx=>{
      const orderRef=d.collection('orders').doc(orderId);
      const order=await tx.get(orderRef);
      if(!order.exists||order.data()?.uid!==uid){
        throw new CustomerActionError('ORDER_NOT_CANCELLABLE','Order not found or does not belong to this customer');
      }
      const orderData=order.data()!;
      if(code(orderData.paymentStatus).toUpperCase()==='PAID'){
        throw new CustomerActionError('PAYMENT_ALREADY_CONFIRMED','Payment is confirmed. Contact store staff to resolve this order');
      }
      if(code(orderData.paymentStatus).toUpperCase()!=='PENDING'){
        throw new CustomerActionError('ORDER_NOT_CANCELLABLE','This order is being processed and cannot be cancelled');
      }
      if(code(orderData.orderStatus).toUpperCase()!=='PAYMENT_PENDING'){
        throw new CustomerActionError('ORDER_NOT_CANCELLABLE','This order can no longer be cancelled');
      }
      const sessionRef=d.collection('sessions').doc(code(orderData.sessionId));
      const session=await tx.get(sessionRef);
      const trolleyQuery=await tx.get(d.collection('trolleys').where('trolleyId','==',code(orderData.trolleyId)).limit(1));
      const trolleyRef=!trolleyQuery.empty?trolleyQuery.docs[0]!.ref:d.collection('trolleys').doc(code(orderData.trolleyId));
      const trolley=!trolleyQuery.empty?trolleyQuery.docs[0]!:await tx.get(trolleyRef);
      if(!session.exists||session.data()?.uid!==uid||session.data()?.closed===true||session.data()?.orderId!==orderId||!trolley.exists||trolley.data()?.currentSessionId!==session.id){
        throw new CustomerActionError('ORDER_NOT_CANCELLABLE','The order session or trolley could not be verified');
      }
      const trolleyId=code(trolley.data()?.trolleyId)||trolley.id;
      trolleyReturn={trolleyId,status:'RETURN_PENDING',reasonCode};
      tx.update(orderRef,{orderStatus:'CANCELLED',cancelReason:reasonCode,cancelledAt:now(),updatedAt:now()});
      tx.update(sessionRef,{status:'CANCELLED',closed:true,closeReason:reasonCode,closedAt:now(),updatedAt:now()});
      tx.update(trolleyRef,{status:'RETURN_PENDING',returnReasonCode:reasonCode,returnCustomerUid:uid,returnCreatedAt:now(),updatedAt:now()});
      tx.delete(d.collection('activeSessions').doc(uid));
      tx.set(d.collection('customerTrolleyReturns').doc(uid),{...trolleyReturn,updatedAt:now()});
    });
    const state=await buildState(uid);
    return {...state,trolleyReturn};
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

async function nextTrolleyId(){
  const snapshot=await db().collection('trolleys').get();
  let max=0;
  snapshot.docs.forEach(doc=>{
    const value=String(doc.data().trolleyId||doc.id);
    const match=value.match(/(\d+)$/);
    if(match)max=Math.max(max,Number(match[1]));
  });
  return `SM-TROLLEY-${String(max+1).padStart(3,'0')}`;
}

export async function adminAction(action:string,p:Obj){
  const d=db();
  if(action==='CREATE_TROLLEY'){
    const trolleyId=code(p.trolleyId)||await nextTrolleyId();
    const name=code(p.name);
    if(!name)throw new Error('Trolley name is required');
    if(!/^[A-Za-z0-9_-]{2,64}$/.test(trolleyId))throw new Error('Trolley ID must be 2-64 letters, numbers, hyphens or underscores');
    const ref=d.collection('trolleys').doc(trolleyId);
    await d.runTransaction(async tx=>{
      const [existingId,existingCode]=await Promise.all([
        tx.get(ref),
        tx.get(d.collection('trolleys').where('trolleyId','==',trolleyId).limit(1)),
      ]);
      if(existingId.exists||!existingCode.empty)throw new Error(`Trolley ${trolleyId} already exists`);
      tx.create(ref,{trolleyId,name,qrPayload:code(p.qrPayload)||trolleyId,status:'AVAILABLE',currentSessionId:'',currentUid:'',createdAt:now(),updatedAt:now()});
    });
    return {trolleyId,name};
  }
  if(action==='SET_TROLLEY_STATUS'){
    const trolleyId=code(p.trolleyId);
    const targetStatus=code(p.status).toUpperCase();
    const reason=code(p.reason);
    if(!trolleyId)throw new Error('trolleyId is required');
    if(!['AVAILABLE','DAMAGED'].includes(targetStatus))throw new Error('Unsupported trolley status');
    if(targetStatus==='DAMAGED'&&!reason)throw new Error('Add a short reason before marking this trolley damaged');
    await d.runTransaction(async tx=>{
      const requestedRef=d.collection('trolleys').doc(trolleyId);
      const requested=await tx.get(requestedRef);
      const matched= requested.exists
        ? null
        : await tx.get(d.collection('trolleys').where('trolleyId','==',trolleyId).limit(1));
      const trolleyRef=requested.exists
        ? requestedRef
        : matched&&!matched.empty
          ? matched.docs[0]!.ref
          : requestedRef;
      const trolley=requested.exists
        ? requested
        : matched&&!matched.empty
          ? matched.docs[0]!
          : requested;
      if(!trolley.exists)throw new Error('Trolley not found');
      const data=trolley.data()!;
      const currentStatus=code(data.status).toUpperCase();
      if(['PAID','RETURN_PENDING'].includes(currentStatus))throw new Error('This trolley has a paid or dispatched order. Complete its return through Dispatch first.');
      if(!['AVAILABLE','IN_USE','PAYMENT_PENDING','DAMAGED','MAINTENANCE'].includes(currentStatus))throw new Error(`Cannot update trolley from ${currentStatus||'unknown'} status`);
      const sessionId=code(data.currentSessionId);
      const sessionRef=sessionId?d.collection('sessions').doc(sessionId):null;
      const session=sessionRef?await tx.get(sessionRef):null;
      const sessionData=session?.exists?session.data():null;
      const orderId=code(sessionData?.orderId);
      const orderRef=orderId?d.collection('orders').doc(orderId):null;
      const order=orderRef?await tx.get(orderRef):null;
      if(order?.exists&&code(order.data()?.paymentStatus).toUpperCase()==='PAID')throw new Error('This trolley has a paid order. Complete its return through Dispatch first.');
      const uid=code(sessionData?.uid||data.currentUid);
      const activeRef=uid?d.collection('activeSessions').doc(uid):null;

      if(session?.exists){
        tx.update(sessionRef!,{status:'CANCELLED',closed:true,closeReason:targetStatus==='DAMAGED'?'TROLLEY_DAMAGED':'ADMIN_RELEASED',closedAt:now(),updatedAt:now()});
      }
      if(order?.exists&&orderRef&&code(order.data()?.paymentStatus).toUpperCase()!=='PAID'){
        tx.update(orderRef,{orderStatus:'CANCELLED',cancelReason:targetStatus==='DAMAGED'?'TROLLEY_DAMAGED':'ADMIN_RELEASED',cancelledAt:now(),updatedAt:now()});
      }
      if(activeRef)tx.delete(activeRef);
      tx.update(trolleyRef,{status:targetStatus,currentSessionId:'',currentUid:'',statusReason:reason||'Admin released trolley',statusUpdatedAt:now(),updatedAt:now()});
      tx.set(d.collection('trolleyMaintenanceLog').doc(id('TML')),{trolleyId,status:targetStatus,previousStatus:currentStatus,reason:reason||'Admin released trolley',cancelledSessionId:sessionId,createdAt:now()});
    });
    return {trolleyId,status:targetStatus};
  }
  if(action==='CONFIRM_PAYMENT'){
    const orderId=code(p.orderId);const oRef=d.collection('orders').doc(orderId);
    await d.runTransaction(async tx=>{
      const o=await tx.get(oRef);if(!o.exists)throw new Error('Order not found');const data=o.data()!;
      if(data.paymentStatus==='PAID')return;
      if(code(data.orderStatus).toUpperCase()==='CANCELLED')throw new Error('This order was cancelled and cannot be paid');
      const cartRef=d.collection('sessions').doc(String(data.sessionId)).collection('cart');
      const cartSnap=await tx.get(cartRef.where('active','==',true));
      if(cartSnap.empty)throw new Error('Cannot confirm payment: the order has no active items');
      const quantities=new Map<string,number>();
      cartSnap.docs.forEach(item=>{
        const productId=code(item.data().productId)||item.id;
        const quantity=Number(item.data().qty);
        if(!Number.isSafeInteger(quantity)||quantity<=0)throw new Error(`Invalid quantity for ${productId}`);
        quantities.set(productId,(quantities.get(productId)||0)+quantity);
      });
      const productRefs=[...quantities.keys()].map(productId=>d.collection('products').doc(productId));
      const productSnaps=await Promise.all(productRefs.map(ref=>tx.get(ref)));
      const stockUpdates=productSnaps.map((product,index)=>{
        const productId=productRefs[index]!.id;
        if(!product.exists)throw new Error(`Cannot confirm payment: product ${productId} was not found`);
        const currentStock=Number(product.data()?.stockQty);
        const quantity=quantities.get(productId)!;
        if(!Number.isSafeInteger(currentStock)||currentStock<0)throw new Error(`Cannot confirm payment: ${productId} has an invalid stock quantity`);
        if(currentStock<quantity)throw new Error(`Insufficient stock for ${product.data()?.name||productId}: available ${currentStock}, ordered ${quantity}`);
        return {ref:product.ref,stockQty:currentStock-quantity};
      });
      stockUpdates.forEach(({ref,stockQty})=>tx.update(ref,{stockQty,updatedAt:now()}));
      tx.update(oRef,{paymentStatus:'PAID',orderStatus:'READY_FOR_DISPATCH',paidAt:now(),updatedAt:now()});
      tx.update(d.collection('sessions').doc(data.sessionId),{status:'PAID',updatedAt:now()});
      tx.update(d.collection('trolleys').doc(data.trolleyId),{status:'PAID',updatedAt:now()});
      tx.set(d.collection('payments').doc(id('PAY')),{orderId,method:data.paymentMethod,amount:data.total,status:'PAID',reference:code(p.reference),confirmedAt:now(),confirmedBy:'ADMIN'});
    });
    return {ok:true};
  }
  throw new Error('Unsupported admin action');
}

export async function listTrolleyStatuses(){
  const snapshot=await db().collection('trolleys').orderBy('trolleyId').get();
  return snapshot.docs.map(doc=>({
    trolleyId:String(doc.data().trolleyId||doc.id),
    status:String(doc.data().status||'UNKNOWN'),
  }));
}

export async function dispatchAction(action:string,p:Obj){
  const d=db(); const trolley=await trolleyByCode(p.trolleyCode);if(!trolley)throw new Error('Trolley not found');
  const sessionId=code(trolley.currentSessionId);
  if(action==='RETURN'){
    let returnedStatus='';
    await d.runTransaction(async tx=>{
      const trolleyRef=d.collection('trolleys').doc(trolley.id);
      const currentTrolley=await tx.get(trolleyRef);
      if(!currentTrolley.exists)throw new Error('Trolley not found');
      const currentTrolleyData=currentTrolley.data()!;
      const currentSessionId=code(currentTrolleyData.currentSessionId);
      const sessionRef=currentSessionId?d.collection('sessions').doc(currentSessionId):null;
      const session=sessionRef?await tx.get(sessionRef):null;
      const orderId=code(session?.data()?.orderId);
      const orderRef=orderId?d.collection('orders').doc(orderId):null;
      const order=orderRef?await tx.get(orderRef):null;
      const orderStatus=code(order?.data()?.orderStatus).toUpperCase();
      if(currentTrolleyData.status!=='RETURN_PENDING'&&orderStatus!=='DISPATCHED'){
        throw new Error('Trolley is not waiting for a verified return');
      }
      const reasonCode=code(currentTrolleyData.returnReasonCode).toUpperCase();
      returnedStatus=reasonCode==='TROLLEY_DAMAGED'?'MAINTENANCE':'AVAILABLE';
      if(order?.exists&&orderRef&&orderStatus==='DISPATCHED'){
        tx.update(orderRef,{orderStatus:'COMPLETED',completedAt:now(),updatedAt:now()});
      }
      if(session?.exists&&sessionRef&&session.data()?.closed!==true){
        tx.update(sessionRef,{status:'COMPLETED',closed:true,closedAt:now(),updatedAt:now()});
      }
      const customerUid=code(currentTrolleyData.returnCustomerUid||session?.data()?.uid);
      if(customerUid){
        tx.delete(d.collection('activeSessions').doc(customerUid));
        tx.set(d.collection('customerTrolleyReturns').doc(customerUid),{
          trolleyId:code(currentTrolleyData.trolleyId)||currentTrolley.id,
          status:returnedStatus,
          reasonCode,
          returnedAt:now(),
          updatedAt:now(),
        },{merge:true});
      }
      tx.update(trolleyRef,{
        status:returnedStatus,
        currentSessionId:'',
        currentUid:'',
        returnCustomerUid:'',
        returnReasonCode:'',
        lastReturnedAt:now(),
        returnedAt:now(),
        updatedAt:now(),
      });
      tx.set(d.collection('dispatchLog').doc(id('DSP')),{
        orderId:orderId||'',
        trolleyId:code(currentTrolleyData.trolleyId)||currentTrolley.id,
        status:'RETURNED',
        returnStatus:returnedStatus,
        reasonCode,
        createdAt:now(),
      });
    });
    return {ok:true,trolleyId:trolley.trolleyId,status:returnedStatus};
  }
  if(!sessionId)return {trolley,order:null,items:[]};
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
    if(!/^[A-Za-z0-9_-]{2,64}$/.test(productId))throw new Error('Product ID must be 2-64 letters, numbers, hyphens or underscores');
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
