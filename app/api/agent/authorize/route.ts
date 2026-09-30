import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {evaluatePayment,getServerPolicy} from "../../../../lib/safety";
import {getSpentToday,reserveSpend} from "../../../../lib/spend-ledger";

export const dynamic="force-dynamic";

export async function POST(request:Request){
  try{
    const approvalSecret=process.env.XAVERUS_APPROVAL_SECRET;
    if(!approvalSecret)return NextResponse.json({ok:false,error:"Server approval is not configured."},{status:503});
    if(request.headers.get("x-xaverus-approval")!==approvalSecret)
      return NextResponse.json({ok:false,error:"Server approval rejected."},{status:403});

    const body=await request.json();
    const amount=Number(body.amount);
    const asset=String(body.asset??"");
    const network=String(body.network??"");
    const recipient=body.recipient?String(body.recipient):undefined;
    const requestId=request.headers.get("x-xaverus-request-id")||String(body.requestId||"");
    if(!requestId||!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId))
      return NextResponse.json({ok:false,error:"A unique X-Xaverus-Request-ID is required."},{status:400});
    if(!Number.isFinite(amount)||amount<=0)
      return NextResponse.json({ok:false,error:"Invalid amount."},{status:400});

    const policy=getServerPolicy();
    const spentToday=await getSpentToday();
    const intent={amount,asset,network,recipient};
    const intentHash=createHash("sha256").update(JSON.stringify({requestId,...intent})).digest("hex");
    const decision=evaluatePayment({...intent,spentToday},policy);
    if(!decision.allowed)
      return NextResponse.json({ok:true,decision,intentHash,executionPerformed:false,mode:"authorization-decision"});

    const reservation=await reserveSpend({requestId,intentHash,amount,daily:policy.daily,activity:{type:"authorization.reserved",requestId,intentHash,amount,asset,network,recipient:recipient??null,executionPerformed:false,executionBoundary:"external-wallet"}});
    if(reservation.status==="blocked")
      return NextResponse.json({ok:true,decision:{allowed:false,reason:"Daily spend limit was reached before reservation."},intentHash,ledger:reservation,executionPerformed:false},{status:409});
    if(reservation.status==="replayed"){
      try{
        const prior=JSON.parse(reservation.record||"{}") as {intentHash?:string;amount?:number};
        if(prior.intentHash!==intentHash||prior.amount!==amount)
          return NextResponse.json({ok:false,error:"Request-ID was already used for a different intent."},{status:409});
      }catch{return NextResponse.json({ok:false,error:"Stored idempotency record is invalid."},{status:503});}
    }
    return NextResponse.json({ok:true,decision,authorization:{status:reservation.status,intentHash,spentToday:reservation.spentToday},executionPerformed:false,executionBoundary:"external-wallet"});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Authorization service unavailable."},{status:503});
  }
}
