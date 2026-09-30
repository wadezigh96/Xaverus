import {NextResponse} from "next/server";
import {readOnchainPolicy} from "../../../../lib/onchain-passport";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const p=await readOnchainPolicy();
    return NextResponse.json({ok:true,service:"Xaverus Safety Passport",mode:"on-chain",
      chain:{name:"X Layer",chainId:196},
      passport:{owner:p.owner,contract:process.env.XAVERUS_PASSPORT_CONTRACT,asset:p.asset},
      policy:{perTx:p.perTx,daily:p.daily,approvalRequired:true,autoStop:true,enabled:p.enabled,allowlistEnabled:p.allowlistEnabled,spentToday:p.spentToday,remainingToday:p.remainingToday},
      execution:{enabled:false,boundary:"external-wallet"}});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"On-chain Safety Passport unavailable."},{status:503});
  }
}
