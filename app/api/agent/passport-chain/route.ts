import {NextResponse} from "next/server";
import {passportChainStatus} from "../../../../lib/passport-chain";

export const dynamic="force-dynamic";

export async function GET(){
  return NextResponse.json({ok:true,service:"Xaverus Safety Passport",network:"X Layer mainnet",...passportChainStatus(),execution:{enabled:false,boundary:"external-wallet"}});
}
