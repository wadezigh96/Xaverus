import {NextResponse} from "next/server";
import {OKXFacilitatorClient} from "@okxweb3/x402-core";
import {x402ResourceServer} from "@okxweb3/x402-core/server";
import {ExactEvmScheme} from "@okxweb3/x402-evm/exact/server";
import {withX402} from "@okxweb3/x402-next";

export const dynamic="force-dynamic";

const NETWORK="eip155:196";

const handler=async()=>NextResponse.json({
  ok:true,
  service:"Xaverus x402 Safety Service",
  network:"X Layer",
  caip2:NETWORK,
  message:"Paid safety-service response delivered after x402 verification.",
  timestamp:new Date().toISOString()
});

const enabled=process.env.XAVERUS_X402_ENABLED==="true";
const configured=Boolean(process.env.OKX_API_KEY&&process.env.OKX_API_SECRET&&process.env.OKX_API_PASSPHRASE&&process.env.XAVERUS_PAY_TO_ADDRESS);

function disabled(){
  return NextResponse.json({
    ok:false,
    service:"Xaverus x402 Safety Service",
    mode:"not-configured",
    network:"X Layer",
    caip2:NETWORK,
    price:process.env.XAVERUS_X402_PRICE||"$0.01",
    message:"x402 seller service is intentionally disabled until OKX credentials and a recipient wallet are configured server-side."
  },{status:503});
}

export const GET=(!enabled||!configured)
  ? async()=>disabled()
  : withX402(
      handler,
      {
        accepts:{
          scheme:"exact",
          network:NETWORK,
          payTo:process.env.XAVERUS_PAY_TO_ADDRESS!,
          price:process.env.XAVERUS_X402_PRICE||"$0.01"
        },
        description:"Xaverus server-side safety service",
        mimeType:"application/json"
      },
      new x402ResourceServer(
        new OKXFacilitatorClient({
          apiKey:process.env.OKX_API_KEY!,
          secretKey:process.env.OKX_API_SECRET!,
          passphrase:process.env.OKX_API_PASSPHRASE!
        })
      ).register(NETWORK,new ExactEvmScheme())
    );
