import {NextResponse} from 'next/server';
import {requireCustomer} from '../../../../lib/customer-auth';
import {CustomerActionError,customerAction} from '../../../../lib/smart-market';
export async function POST(req:Request){try{const u=await requireCustomer(req);const b=await req.json();const data=await customerAction(u.uid,String(b.action||''),b.payload||{});return NextResponse.json({ok:true,data})}catch(e:any){if(e instanceof CustomerActionError)return NextResponse.json({ok:false,error:e.message,errorCode:e.code},{status:409});return NextResponse.json({ok:false,error:e?.message||'Request failed'},{status:400})}}
