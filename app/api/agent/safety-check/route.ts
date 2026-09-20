import {NextResponse} from "next/server";
import {DEFAULT_POLICY,evaluatePayment,SafetyPolicy} from "../../../../lib/safety";

export async function POST(request:Request){
 try{
  const body=await request.json();
  const amount=Number(body.amount);
  const spentToday=Number(body.spentToday??0);
  const policy:SafetyPolicy={
   perTx:Number(body.policy?.perTx??DEFAULT_POLICY.perTx),
   daily:Number(body.policy?.daily??DEFAULT_POLICY.daily),
   approvalRequired:Boolean(body.policy?.approvalRequired??DEFAULT_POLICY.approvalRequired),
   autoStop:Boolean(body.policy?.autoStop??DEFAULT_POLICY.autoStop),
   enabled:Boolean(body.policy?.enabled??DEFAULT_POLICY.enabled)
  };
  if(!Number.isFinite(amount)||!Number.isFinite(spentToday)) return NextResponse.json({ok:false,error:"Invalid numeric input"},{status:400});
  const decision=evaluatePayment(amount,spentToday,policy);
  return NextResponse.json({ok:true,service:"Xaverus Safety Passport",decision,intent:{amount,asset:"USDC",network:"X Layer",approvalRequired:policy.approvalRequired},safety:{policyEvaluatedServerSide:true,executionPerformed:false,mode:"decision-only"}});
 }catch{return NextResponse.json({ok:false,error:"Invalid JSON"},{status:400});}
}