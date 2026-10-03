import {NextResponse} from 'next/server';
import {isAdmin} from '../../../../lib/admin-session';
import {adminProductAction,listProducts} from '../../../../lib/smart-market';
export async function GET(req:Request){
  if(!await isAdmin())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  const q=new URL(req.url).searchParams.get('q')||'';
  try{return NextResponse.json({ok:true,data:await listProducts(q)})}catch(e:any){return NextResponse.json({ok:false,error:e?.message||'Request failed'},{status:400})}
}
export async function POST(req:Request){
  if(!await isAdmin())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  try{const b=await req.json();return NextResponse.json({ok:true,data:await adminProductAction(String(b.action||''),b.payload||{})})}catch(e:any){return NextResponse.json({ok:false,error:e?.message||'Request failed'},{status:400})}
}
