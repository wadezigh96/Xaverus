import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {evaluatePayment,getServerPolicy} from "../../../../lib/safety";\nimport {getSpentToday} from "../../../../lib/spend-ledger";
export const dynamic="force-dynamic";
const seen=new Map<string,number>();
const REPLAY_TTL_MS=10*60*1000;
function cleanup(now:number){for(const [key,expires] of seen)if(expires<=now)seen.delete(key);}
export async function POST(request:Request){
 try{
  const body=await request.json();
  const amount=Number(body.amount);
  const spentToday=await getSpentToday();
  const asset=String(body.asset??"USDC");
  const network=String(body.network??"X Layer");
  const recipient=body.recipient?String(body.recipient):undefined;
  const requestId=request.headers.get("x-xaverus-request-id")||String(body.requestId||"");
  if(!requestId||!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId))return NextResponse.json({ok:false,error:"A unique X-Xaverus-Request-ID is required."},{status:400});
  if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(spentToday)||spentToday<0)return NextResponse.json({ok:false,error:"Invalid numeric input."},{status:400});
  const policy=getServerPolicy(); const now=Date.now(); cleanup(now);
  const intentHash=createHash("sha256").update(JSON.stringify({requestId,amount,asset,network,recipient})).digest("hex");
  if(seen.has(intentHash))return NextResponse.json({ok:false,error:"Replay detected.",requestId,intentHash},{status:409});
  const decision=evaluatePayment({amount,spentToday,asset,network,recipient},policy);
  seen.set(intentHash,now+REPLAY_TTL_MS);
  return NextResponse.json({ok:true,service:"Xaverus Safety Passport",requestId,intentHash,decision,
    intent:{amount,asset,network,recipient:recipient??null,approvalRequired:policy.approvalRequired},
    safety:{policyEvaluatedServerSide:true,clientPolicyAccepted:false,spentTodaySource:"upstash-durable-ledger",replayGuard:"process-local-10m",executionPerformed:false,mode:"decision-only"}});
 }catch{return NextResponse.json({ok:false,error:"Invalid JSON."},{status:400});}
}
