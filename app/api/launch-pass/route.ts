import {NextResponse} from "next/server";
import {OKXFacilitatorClient,x402ResourceServer} from "@okxweb3/x402-core";
import {ExactEvmScheme} from "@okxweb3/x402-evm/exact/server";
import {withX402} from "@okxweb3/x402-next";
import {randomBytes,createHmac} from "node:crypto";
export const dynamic="force-dynamic";
const MAINNET="eip155:196"; const TESTNET="eip155:1952";
const NETWORK=process.env.XAVERUS_LAUNCH_PASS_NETWORK||TESTNET;
const PRICE=process.env.XAVERUS_LAUNCH_PASS_PRICE||"$2";
const PAY_TO=process.env.XAVERUS_PAY_TO_ADDRESS;
const configured=Boolean(process.env.OKX_API_KEY&&process.env.OKX_API_SECRET&&process.env.OKX_API_PASSPHRASE&&PAY_TO&&process.env.XAVERUS_LAUNCH_PASS_ENABLED==="true");
if(NETWORK!==MAINNET&&NETWORK!==TESTNET) throw new Error("XAVERUS_LAUNCH_PASS_NETWORK must be eip155:196 or eip155:1952");
function issueCredential(){const id="XV-"+randomBytes(8).toString("hex").toUpperCase();const secret=randomBytes(24).toString("base64url");const issuedAt=new Date().toISOString();const payload=Buffer.from(JSON.stringify({id,issuedAt,scope:["marketplace","agent-activation","safety"]})).toString("base64url");const key=process.env.XAVERUS_CREDENTIAL_SECRET;if(!key) throw new Error("XAVERUS_CREDENTIAL_SECRET is not configured");const sig=createHmac("sha256",key).update(payload+"."+secret).digest("base64url");return {credentialId:id,credential:payload+"."+secret+"."+sig,issuedAt,scope:["marketplace","agent-activation","safety"]};}
const handler=async()=>{try{return NextResponse.json({ok:true,service:"Xaverus Launch Pass",status:"active",price:PRICE,network:NETWORK,pass:issueCredential(),note:"Store this credential securely. It is shown once."});}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Credential issuance failed"},{status:503});}};
function disabled(){return NextResponse.json({ok:false,service:"Xaverus Launch Pass",mode:"not-configured",price:PRICE,network:NETWORK,message:"Launch Pass payment is not enabled. Configure server-side x402 credentials and XAVERUS_CREDENTIAL_SECRET before accepting payments."},{status:503});}
export const GET=(!configured)?async()=>disabled():withX402(handler,{accepts:{scheme:"exact",network:NETWORK,payTo:PAY_TO!,price:PRICE},description:"Xaverus one-time Launch Pass",mimeType:"application/json"},new x402ResourceServer(new OKXFacilitatorClient({apiKey:process.env.OKX_API_KEY!,secretKey:process.env.OKX_API_SECRET!,passphrase:process.env.OKX_API_PASSPHRASE!})).register(NETWORK,new ExactEvmScheme()));