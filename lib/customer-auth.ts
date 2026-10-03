import {adminAuth} from './firebase-admin';

export async function requireCustomer(request:Request){
  const h=request.headers.get('authorization')||'';
  const token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token) throw new Error('Missing Firebase token');
  const decoded=await adminAuth().verifyIdToken(token,true);
  if(!decoded.uid) throw new Error('Invalid Firebase token');
  return decoded;
}
