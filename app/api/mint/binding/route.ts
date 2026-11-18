import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {getHumanProofStore} from "../../../../lib/human-proof-store";

export const dynamic="force-dynamic";

/**
 * Read the X Binding for a wallet, if one was recorded through OAuth.
 * Lets the mint page show the bound X user id without asking the user to
 * type their numeric id by hand. Returns hashes only, never anything the
 * user typed.
 */
export async function GET(request:Request){
  try{
    const wallet=new URL(request.url).searchParams.get("wallet")??"";
    if(!isAddress(wallet))
      return NextResponse.json({ok:false,error:"A valid EVM wallet address is required."},{status:400});

    const binding=getHumanProofStore().getBinding(wallet);
    if(!binding) return NextResponse.json({ok:true,bound:false});

    return NextResponse.json({
      ok:true,
      bound:true,
      binding:{
        wallet:binding.wallet,
        xUserId:binding.xUserId,
        xHandleHash:binding.xHandleHash,
        boundAt:binding.boundAt,
      },
    });
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Binding could not be read."},{status:500});
  }
}
