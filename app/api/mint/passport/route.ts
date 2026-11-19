import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {getHumanProofStore} from "../../../../lib/human-proof-store";
import {isProofValid} from "../../../../lib/human-proof";
import {buildMintTransaction} from "../../../../lib/mint-transaction";
import {checkPolicyCircuit, getTapeOutConfig, type TapeOutCheck} from "../../../../lib/mint-tapeout";
import {publicProof, UID_CLAIM_NOTE} from "../../../../lib/mint-response";

export const dynamic="force-dynamic";

export async function POST(request:Request){
  try{
    let body:Record<string,unknown>;
    try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"Invalid JSON.",claim:UID_CLAIM_NOTE},{status:400});}

    const wallet=String(body.wallet??"");
    if(!isAddress(wallet))
      return NextResponse.json({ok:false,error:"A valid EVM wallet address is required.",claim:UID_CLAIM_NOTE},{status:400});

    const proof=getHumanProofStore().getProof(wallet);
    if(!proof||!isProofValid(proof))
      return NextResponse.json({
        ok:false,
        allowed:false,
        error:"This wallet has no valid Human Proof. Connect X and submit an OKX UID claim first.",
        claim:UID_CLAIM_NOTE,
      },{status:403});

    // TapeOut policy circuit (ADR-0002): when a circuit is configured, the
    // mint decision evaluates it read-only. Unconfigured, the check is
    // skipped openly. An eval failure is a 503, never a denial.
    let tapeoutConfig;
    try{
      tapeoutConfig=getTapeOutConfig();
    }catch(error){
      return NextResponse.json({ok:false,error:`Server misconfiguration: ${error instanceof Error?error.message:"bad TapeOut config."}`,claim:UID_CLAIM_NOTE},{status:500});
    }
    let tapeout:TapeOutCheck;
    try{
      tapeout=await checkPolicyCircuit(proof,tapeoutConfig);
    }catch(error){
      return NextResponse.json({ok:false,error:`Policy circuit could not be evaluated: ${error instanceof Error?error.message:"unknown error."}`,claim:UID_CLAIM_NOTE},{status:503});
    }
    if(tapeout.configured&&!tapeout.allowed)
      return NextResponse.json({
        ok:false,
        allowed:false,
        error:"The TapeOut policy circuit denied this mint.",
        tapeout,
        proof:publicProof(proof),
        claim:UID_CLAIM_NOTE,
      },{status:403});

    const factory=process.env.XAVERUS_PASSPORT_FACTORY?.trim();
    if(!factory)
      return NextResponse.json({
        ok:true,
        allowed:true,
        transaction:null,
        note:"Factory not deployed yet — deploy it and set XAVERUS_PASSPORT_FACTORY",
        proof:publicProof(proof),
        tapeout,
        claim:UID_CLAIM_NOTE,
      });

    let transaction;
    try{
      transaction=buildMintTransaction(factory);
    }catch{
      return NextResponse.json({ok:false,error:"Server misconfiguration: XAVERUS_PASSPORT_FACTORY is not a valid address.",claim:UID_CLAIM_NOTE},{status:500});
    }

    return NextResponse.json({
      ok:true,
      allowed:true,
      transaction,
      executionPerformed:false,
      chain:{name:"X Layer",chainId:196},
      proof:publicProof(proof),
      tapeout,
      claim:UID_CLAIM_NOTE,
    });
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Mint request could not be processed.",claim:UID_CLAIM_NOTE},{status:500});
  }
}
