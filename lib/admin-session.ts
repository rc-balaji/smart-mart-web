import {SignJWT,jwtVerify} from 'jose';
import {cookies} from 'next/headers';

const COOKIE='sm_admin';
const secret=()=>new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET||'');

export async function createAdminSession(username:string){
  if(!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length<32) throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters');
  return new SignJWT({role:'admin',username}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('8h').sign(secret());
}
export async function isAdmin(){
  try{
    const token=(await cookies()).get(COOKIE)?.value;if(!token)return false;
    const {payload}=await jwtVerify(token,secret());return payload.role==='admin';
  }catch{return false}
}
export const adminCookieName=COOKIE;
