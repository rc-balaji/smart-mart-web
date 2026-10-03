import {NextResponse} from 'next/server';
import {createAdminSession,adminCookieName} from '../../../../lib/admin-session';

export async function POST(req:Request){
  const {username,password}=await req.json();
  if(username!==process.env.ADMIN_USERNAME||password!==process.env.ADMIN_PASSWORD)return NextResponse.json({ok:false,error:'Invalid login'},{status:401});
  const token=await createAdminSession(username);
  const res=NextResponse.json({ok:true});
  res.cookies.set(adminCookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*8});
  return res;
}
