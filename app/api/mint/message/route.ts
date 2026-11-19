import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {buildBindingMessage, hashUid} from "../../../../lib/human-proof";
import {UID_CLAIM_NOTE} from "../../../../lib/mint-response";

export const dynamic="force-dynamic";

/** Binding messages are valid for 15 minutes from issue. */
const MESSAGE_TTL_SECONDS=900;

/**
 * Build the binding message the wallet signs. The server hashes the UID and
 * picks the expiry; the browser never builds the message itself (the library
 * imports node:crypto, which does not exist in the browser), and the raw UID
 * is never returned.
 *
 * POST with a JSON body, like /api/mint/claim: the raw UID must never travel
 * in a URL query string, where it would land in browser history, server
 * access logs, and analytics. There is deliberately no GET handler.
 */
export async function POST(request:Request){
  try{
    let body:Record<string,unknown>;
    try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"Invalid JSON.",claim:UID_CLAIM_NOTE},{status:400});}

    const wallet=String(body.wallet??"");
    const xUserId=String(body.xUserId??"");
    const okxUid=String(body.okxUid??"");

    if(!isAddress(wallet))
      return NextResponse.json({ok:false,error:"A valid EVM wallet address is required.",claim:UID_CLAIM_NOTE},{status:400});
    if(!xUserId.trim())
      return NextResponse.json({ok:false,error:"An X user id is required.",claim:UID_CLAIM_NOTE},{status:400});
    if(!okxUid.trim())
      return NextResponse.json({ok:false,error:"An OKX UID is required.",claim:UID_CLAIM_NOTE},{status:400});

    // The raw UID is hashed server-side and never returned or logged.
    const expiresAt=Math.floor(Date.now()/1000)+MESSAGE_TTL_SECONDS;
    const message=buildBindingMessage({
      wallet,
      xUserId:xUserId.trim(),
      okxUidHash:hashUid(okxUid),
      expiresAt,
    });
    return NextResponse.json({ok:true,message,expiresAt,claim:UID_CLAIM_NOTE});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Binding message could not be built.",claim:UID_CLAIM_NOTE},{status:500});
  }
}
