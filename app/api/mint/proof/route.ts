import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {getHumanProofStore} from "../../../../lib/human-proof-store";
import {isProofValid} from "../../../../lib/human-proof";
import {publicProof, UID_CLAIM_NOTE} from "../../../../lib/mint-response";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const wallet=new URL(request.url).searchParams.get("wallet")??"";
    if(!isAddress(wallet))
      return NextResponse.json({ok:false,error:"A valid EVM wallet address is required.",claim:UID_CLAIM_NOTE},{status:400});

    const proof=getHumanProofStore().getProof(wallet);
    if(!proof||!isProofValid(proof))
      return NextResponse.json({ok:true,present:false,claim:UID_CLAIM_NOTE});

    return NextResponse.json({ok:true,present:true,proof:publicProof(proof),claim:UID_CLAIM_NOTE});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Proof status could not be read.",claim:UID_CLAIM_NOTE},{status:500});
  }
}
