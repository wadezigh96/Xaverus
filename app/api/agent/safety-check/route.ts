import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {readOnchainPolicy} from "../../../../lib/onchain-passport";

export const dynamic="force-dynamic";

export async function POST(request:Request){
  let body:Record<string,unknown>;
  try{body=await request.json();}
  catch{return NextResponse.json({ok:false,error:"Invalid JSON."},{status:400});}

  try{
    const amount=Number(body.amount);
    const asset=String(body.asset??"USDC");
    const network=String(body.network??"X Layer");
    const recipient=body.recipient?String(body.recipient):undefined;
    const requestId=request.headers.get("x-xaverus-request-id")||String(body.requestId||"");
    if(!requestId||!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId))
      return NextResponse.json({ok:false,error:"A unique X-Xaverus-Request-ID is required."},{status:400});
    if(!Number.isFinite(amount)||amount<=0)
      return NextResponse.json({ok:false,error:"Invalid amount."},{status:400});

    const policy=await readOnchainPolicy();
    const intentHash=createHash("sha256").update(JSON.stringify({requestId,amount,asset,network,recipient})).digest("hex");

    if(!policy.enabled)
      return NextResponse.json({ok:true,service:"Xaverus Safety Passport",requestId,intentHash,
        decision:{allowed:false,reason:"Safety Passport is stopped by the on-chain kill switch."},
        safety:{policySource:"xlayer-onchain",executionPerformed:false,mode:"decision-only"}});

    if(asset!=="USDC")
      return NextResponse.json({ok:true,service:"Xaverus Safety Passport",requestId,intentHash,
        decision:{allowed:false,reason:"Asset is not allowed by the on-chain Safety Passport."},
        safety:{policySource:"xlayer-onchain",executionPerformed:false,mode:"decision-only"}});

    if(network!=="X Layer")
      return NextResponse.json({ok:true,service:"Xaverus Safety Passport",requestId,intentHash,
        decision:{allowed:false,reason:"Network is not allowed by the on-chain Safety Passport."},
        safety:{policySource:"xlayer-onchain",executionPerformed:false,mode:"decision-only"}});

    const recipientAllowed=!policy.allowlistEnabled || (recipient ? await (async()=>{
      const {createPublicClient,http}=await import("viem");
      const c=createPublicClient({chain:{id:196,name:"X Layer",nativeCurrency:{name:"OKB",symbol:"OKB",decimals:18},rpcUrls:{default:{http:[process.env.XAVERUS_RPC_URL||"https://rpc.xlayer.tech"]}}},transport:http(process.env.XAVERUS_RPC_URL||"https://rpc.xlayer.tech")});
      return Boolean(await c.readContract({address:policy.owner,abi:[],functionName:"recipientAllowed"}).catch(()=>false));
    })() : false);

    let decision:{allowed:boolean;reason:string};
    if(amount>policy.perTx) decision={allowed:false,reason:"Transaction exceeds the on-chain per-transaction limit."};
    else if(policy.spentToday+amount>policy.daily) decision={allowed:false,reason:"Transaction exceeds the on-chain daily spending limit."};
    else if(policy.allowlistEnabled && !recipientAllowed) decision={allowed:false,reason:"Recipient is not in the on-chain Safety Passport allowlist."};
    else decision={allowed:true,reason:"On-chain policy checks passed."};

    return NextResponse.json({ok:true,service:"Xaverus Safety Passport",requestId,intentHash,
      decision,intent:{amount,asset,network,recipient:recipient??null,approvalRequired:true},
      onchain:{chainId:196,owner:policy.owner,asset:policy.asset,spentToday:policy.spentToday,remainingToday:policy.remainingToday},
      safety:{policySource:"xlayer-onchain",clientPolicyAccepted:false,executionPerformed:false,mode:"decision-only"}});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"On-chain Safety Passport unavailable."},{status:503});
  }
}
