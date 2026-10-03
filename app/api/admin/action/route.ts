import {NextResponse} from 'next/server';
import {isAdmin} from '../../../../lib/admin-session';
import {adminAction} from '../../../../lib/smart-market';
export async function POST(req:Request){try{if(!await isAdmin())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});const b=await req.json();return NextResponse.json({ok:true,data:await adminAction(String(b.action||''),b.payload||{})})}catch(e:any){return NextResponse.json({ok:false,error:e?.message||'Request failed'},{status:400})}}
