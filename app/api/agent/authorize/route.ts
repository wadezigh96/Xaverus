import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {isAddress} from "viem";
import {buildOnchainAuthorization,readOnchainPolicy,readRecipientAllowed,readAuthorizationStatus} from "../../../../lib/onchain-passport";

export const dynamic="force-dynamic";

export async function POST(request:Request){
  try{
    let body:Record<string,unknown>;
    try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"Invalid JSON."},{status:400});}

    const amount=Number(body.amount);
    const asset=String(body.asset??"USDC");
    const network=String(body.network??"X Layer");
    const recipient=String(body.recipient??"");
    const walletAddress=String(body.walletAddress??"");
    const requestId=request.headers.get("x-xaverus-request-id")||String(body.requestId||"");

    if(!requestId||!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId))
      return NextResponse.json({ok:false,error:"A unique X-Xaverus-Request-ID is required."},{status:400});
    if(asset!=="USDC"||network!=="X Layer")
      return NextResponse.json({ok:false,error:"Only USDC on X Layer is supported by this Passport."},{status:400});
    if(!Number.isFinite(amount)||amount<=0)
      return NextResponse.json({ok:false,error:"Invalid amount."},{status:400});
    if(!isAddress(recipient))
      return NextResponse.json({ok:false,error:"A valid EVM recipient address is required."},{status:400});
    if(!isAddress(walletAddress))
      return NextResponse.json({ok:false,error:"A valid EVM wallet address is required."},{status:400});

    const policy=await readOnchainPolicy();
    const intentHash=createHash("sha256").update(JSON.stringify({requestId,amount,asset,network,recipient,walletAddress})).digest("hex");

    if(await readAuthorizationStatus(requestId))
      return NextResponse.json({
        ok:false,
        error:"This X-Xaverus-Request-ID has already been authorized on-chain.",
        intentHash,
        replay:true,
      },{status:409});
    if(!policy.enabled)
      return NextResponse.json({ok:false,error:"On-chain Safety Passport is stopped."},{status:409});
    if(amount>policy.perTx)
      return NextResponse.json({ok:false,error:"Transaction exceeds the on-chain per-transaction limit.",intentHash},{status:409});
    if(policy.spentToday+amount>policy.daily)
      return NextResponse.json({ok:false,error:"Transaction exceeds the on-chain daily spending limit.",intentHash},{status:409});
    if(policy.allowlistEnabled && !(await readRecipientAllowed(recipient)))
      return NextResponse.json({ok:false,error:"Recipient is not in the on-chain Safety Passport allowlist.",intentHash},{status:409});

    const tx=await buildOnchainAuthorization({requestId,amount,recipient,walletAddress});
    return NextResponse.json({ok:true,decision:{allowed:true,reason:"On-chain policy checks passed; wallet signature required."},
      authorization:{mode:"on-chain-wallet-approval",intentHash,executionPerformed:false},
      transaction:tx,
      chain:{name:"X Layer",chainId:196}});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"On-chain authorization unavailable."},{status:503});
  }
}
