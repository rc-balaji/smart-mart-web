import {NextResponse} from 'next/server';
import {adminCookieName} from '../../../../lib/admin-session';
export async function POST(){const r=NextResponse.json({ok:true});r.cookies.set(adminCookieName,'',{httpOnly:true,path:'/',maxAge:0});return r}
