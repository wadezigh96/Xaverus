import {NextResponse} from "next/server";
import {randomBytes,createHmac} from "node:crypto";

export const dynamic="force-dynamic";

const NETWORK=process.env.XAVERUS_LAUNCH_PASS_NETWORK||"eip155:1952";
const PRICE=process.env.XAVERUS_LAUNCH_PASS_PRICE||"$2";

function issueCredential(){
  const id="XV-"+randomBytes(8).toString("hex").toUpperCase();
  const secret=randomBytes(24).toString("base64url");
  const issuedAt=new Date().toISOString();
  const payload=Buffer.from(JSON.stringify({id,issuedAt,scope:["marketplace","agent-activation","safety"]})).toString("base64url");
  const key=process.env.XAVERUS_CREDENTIAL_SECRET;
  if(!key) throw new Error("XAVERUS_CREDENTIAL_SECRET is not configured");
  const sig=createHmac("sha256",key).update(payload+"."+secret).digest("base64url");
  return {credentialId:id,credential:payload+"."+secret+"."+sig,issuedAt,scope:["marketplace","agent-activation","safety"]};
}

export async function GET(){
  return NextResponse.json({
    ok:false,
    service:"Xaverus Launch Pass",
    mode:"not-configured",
    network:NETWORK,
    price:PRICE,
    message:"Launch Pass is not enabled in this deployment."
  },{status:503});
}
