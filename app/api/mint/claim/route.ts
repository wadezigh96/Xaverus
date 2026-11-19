import {NextResponse} from "next/server";
import {isAddress, type Hex} from "viem";
import {getHumanProofStore} from "../../../../lib/human-proof-store";
import {hashUid, ProofStoreError, type HumanProof, type ProofStoreErrorCode} from "../../../../lib/human-proof";
import {publicProof, UID_CLAIM_NOTE} from "../../../../lib/mint-response";

export const dynamic="force-dynamic";

/** How each store refusal maps to an HTTP status, by error code. */
const CLAIM_ERROR_STATUS: Partial<Record<ProofStoreErrorCode, number>> = {
  ALREADY_HAS_PROOF: 409,
  NO_BINDING: 409,
  EXPIRED: 400,
  BAD_SIGNATURE: 401,
};

export async function POST(request:Request){
  try{
    let body:Record<string,unknown>;
    try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"Invalid JSON.",claim:UID_CLAIM_NOTE},{status:400});}

    const wallet=String(body.wallet??"");
    const xUserId=String(body.xUserId??"");
    const okxUid=String(body.okxUid??"");
    const signature=String(body.signature??"");
    const expiresAt=Number(body.expiresAt);

    if(!isAddress(wallet))
      return NextResponse.json({ok:false,error:"A valid EVM wallet address is required.",claim:UID_CLAIM_NOTE},{status:400});
    if(!xUserId.trim())
      return NextResponse.json({ok:false,error:"An X user id is required.",claim:UID_CLAIM_NOTE},{status:400});
    if(!okxUid.trim())
      return NextResponse.json({ok:false,error:"An OKX UID is required.",claim:UID_CLAIM_NOTE},{status:400});
    if(!/^0x[0-9a-fA-F]{130}$/.test(signature))
      return NextResponse.json({ok:false,error:"A valid 65-byte wallet signature is required.",claim:UID_CLAIM_NOTE},{status:400});
    if(!Number.isInteger(expiresAt)||expiresAt<=0)
      return NextResponse.json({ok:false,error:"A valid expiry timestamp is required.",claim:UID_CLAIM_NOTE},{status:400});

    // The raw UID is hashed server-side and never stored or logged.
    const okxUidHash=hashUid(okxUid);
    let proof: HumanProof;
    try{
      proof=await getHumanProofStore().issueProof({
        wallet,
        xUserId: xUserId.trim(),
        okxUidHash,
        signature: signature as Hex,
        expiresAt,
      });
    }catch(error){
      if(error instanceof ProofStoreError){
        const status=CLAIM_ERROR_STATUS[error.code];
        if(status!==undefined)
          return NextResponse.json({ok:false,error:error.message,claim:UID_CLAIM_NOTE},{status});
      }
      throw error;
    }

    return NextResponse.json({ok:true,proof:publicProof(proof),claim:UID_CLAIM_NOTE});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Claim could not be processed.",claim:UID_CLAIM_NOTE},{status:500});
  }
}
