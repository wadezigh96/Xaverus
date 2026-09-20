import {NextResponse} from "next/server";
import {integrationStatus} from "../../../lib/okx";

export const dynamic="force-dynamic";

function x402Config(){
  const enabled=process.env.XAVERUS_X402_ENABLED==="true";
  const required={
    OKX_API_KEY:Boolean(process.env.OKX_API_KEY),
    OKX_API_SECRET:Boolean(process.env.OKX_API_SECRET),
    OKX_API_PASSPHRASE:Boolean(process.env.OKX_API_PASSPHRASE),
    XAVERUS_PAY_TO_ADDRESS:Boolean(process.env.XAVERUS_PAY_TO_ADDRESS),
  };
  const configured=Object.values(required).every(Boolean);
  return {
    enabled,
    configured,
    ready:enabled&&configured,
    network:process.env.XAVERUS_X402_NETWORK||"eip155:196",
    price:process.env.XAVERUS_X402_PRICE||"$0.01",
    required,
  };
}

export async function GET(){
  return NextResponse.json({
    service:"xaverus",
    integrations:integrationStatus(),
    x402:x402Config(),
    safety:{
      serverSidePolicyRequired:true,
      secretsNeverClientSide:true
    }
  })
}