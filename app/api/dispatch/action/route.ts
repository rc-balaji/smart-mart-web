import {NextResponse} from 'next/server';
import {isAdmin} from '../../../../lib/admin-session';
import {dispatchAction,listTrolleyStatuses} from '../../../../lib/smart-market';
export async function GET(){try{if(!await isAdmin())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});return NextResponse.json({ok:true,data:await listTrolleyStatuses()})}catch(e:any){return NextResponse.json({ok:false,error:e?.message||'Request failed'},{status:400})}}
export async function POST(req:Request){try{if(!await isAdmin())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});const b=await req.json();return NextResponse.json({ok:true,data:await dispatchAction(String(b.action||''),b.payload||{})})}catch(e:any){return NextResponse.json({ok:false,error:e?.message||'Request failed'},{status:400})}}
