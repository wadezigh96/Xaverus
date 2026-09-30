import {NextResponse} from "next/server";
import {getServerPolicy} from "../../../../lib/safety";
export const dynamic="force-dynamic";
export async function GET(){
 const p=getServerPolicy();
 return NextResponse.json({ok:true,service:"Xaverus Safety Passport",mode:"server-authoritative",
  policy:{perTx:p.perTx,daily:p.daily,approvalRequired:p.approvalRequired,autoStop:p.autoStop,enabled:p.enabled,asset:p.asset,network:p.network,recipientAllowlistConfigured:p.recipientAllowlist.length>0},
  execution:{enabled:false,boundary:"external-wallet"}});
}
