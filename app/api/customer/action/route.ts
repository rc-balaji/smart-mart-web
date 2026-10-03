import {NextResponse} from 'next/server';
import {requireCustomer} from '../../../../lib/customer-auth';
import {customerAction} from '../../../../lib/smart-market';
export async function POST(req:Request){try{const u=await requireCustomer(req);const b=await req.json();const data=await customerAction(u.uid,String(b.action||''),b.payload||{});return NextResponse.json({ok:true,data})}catch(e:any){return NextResponse.json({ok:false,error:e?.message||'Request failed'},{status:400})}}
