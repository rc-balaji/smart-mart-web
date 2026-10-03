import {cert, getApps, initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';

function privateKey(){
  const raw=process.env.FIREBASE_PRIVATE_KEY;
  if(!raw) throw new Error('FIREBASE_PRIVATE_KEY is missing');
  return raw.replace(/\\n/g,'\n');
}

export function adminApp(){
  if(getApps().length) return getApps()[0]!;
  const projectId=process.env.FIREBASE_PROJECT_ID;
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
  if(!projectId||!clientEmail) throw new Error('Firebase Admin env vars are incomplete');
  return initializeApp({credential:cert({projectId,clientEmail,privateKey:privateKey()})});
}
export const db=()=>getFirestore(adminApp());
export const adminAuth=()=>getAuth(adminApp());
