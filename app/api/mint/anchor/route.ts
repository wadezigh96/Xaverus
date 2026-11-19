import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {AnchorFileNotFoundError, readAnchorFile} from "../../../../lib/tapeout-anchor";

export const dynamic="force-dynamic";

/**
 * Verify a wallet's anchored Human Proof: read the proof file back from the
 * TapeOut container and check its bytes against the on-chain SHA-256.
 * Anyone can verify a mint this way without trusting the Xaverus server.
 * Unconfigured (no container yet) or unanchored wallets answer honestly.
 */
export async function GET(request:Request){
  try{
    const wallet=new URL(request.url).searchParams.get("wallet")??"";
    if(!isAddress(wallet))
      return NextResponse.json({ok:false,error:"A valid EVM wallet address is required."},{status:400});

    const container=process.env.XAVERUS_TAPEOUT_CONTAINER?.trim();
    if(!container||!isAddress(container))
      return NextResponse.json({
        ok:true,
        anchored:false,
        note:"No TapeOut container is configured yet — the proof has not been anchored on-chain.",
      });

    const path=`proofs/${wallet.toLowerCase()}.json`;
    try{
      const file=await readAnchorFile({
        container:container as `0x${string}`,
        path,
        rpcUrl:process.env.XAVERUS_TAPEOUT_RPC_URL?.trim()||"https://rpc.xlayer.tech",
      });
      return NextResponse.json({
        ok:true,
        anchored:true,
        path:file.path,
        container,
        sha256:file.sha256,
        size:file.size,
        chunkCount:file.chunkCount,
        updatedAt:file.updatedAt,
      });
    }catch(error){
      // readAnchorFile throws AnchorFileNotFoundError for a missing file;
      // that is an honest unanchored answer, not a server error.
      if(error instanceof AnchorFileNotFoundError){
        return NextResponse.json({ok:true,anchored:false,path,container});
      }
      throw error;
    }
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Anchor could not be read."},{status:503});
  }
}
