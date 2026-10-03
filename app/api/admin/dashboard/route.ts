import {NextResponse} from 'next/server';
import {isAdmin} from '../../../../lib/admin-session';
import {dashboard} from '../../../../lib/smart-market';
export async function GET(){if(!await isAdmin())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});return NextResponse.json({ok:true,data:await dashboard()})}
