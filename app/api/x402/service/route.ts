import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

export async function GET(){
 const enabled=process.env.XAVERUS_X402_ENABLED==="true";
 const configured=Boolean(process.env.OKX_API_KEY&&process.env.OKX_API_SECRET&&process.env.OKX_API_PASSPHRASE&&process.env.XAVERUS_PAY_TO_ADDRESS);
 if(!enabled||!configured){
  return NextResponse.json({ok:false,service:"Xaverus x402 Safety Service",mode:"not-configured",network:"X Layer",caip2:"eip155:196",price:process.env.XAVERUS_X402_PRICE||"$0.01",message:"x402 seller service is intentionally disabled until OKX credentials and a recipient wallet are configured server-side."},{status:503});
 }
 try{
  const [{OKXFacilitatorClient},{x402ResourceServer},{ExactEvmScheme},{withX402}]=await Promise.all([import("@okxweb3/x402-core"),import("@okxweb3/x402-core/server"),import("@okxweb3/x402-evm/exact/server"),import("@okxweb3/x402-next")]);
  const facilitator=new OKXFacilitatorClient({apiKey:process.env.OKX_API_KEY!,secretKey:process.env.OKX_API_SECRET!,passphrase:process.env.OKX_API_PASSPHRASE!});
  const server=new x402ResourceServer(facilitator).register("eip155:196",new ExactEvmScheme());
  const handler=async()=>NextResponse.json({ok:true,service:"Xaverus x402 Safety Service",network:"X Layer",caip2:"eip155:196",message:"Paid safety-service response delivered after x402 verification.",timestamp:new Date().toISOString()});
  const wrapped=withX402(handler,{accepts:{scheme:"exact",network:"eip155:196",payTo:process.env.XAVERUS_PAY_TO_ADDRESS!,price:process.env.XAVERUS_X402_PRICE||"$0.01"},description:"Xaverus server-side safety service",mimeType:"application/json"},server);
  return await wrapped(new Request("https://xaverus.local/api/x402/service"));
 }catch(error){
  return NextResponse.json({ok:false,service:"Xaverus x402 Safety Service",mode:"configuration-error",error:error instanceof Error?error.message:"x402 initialization failed"},{status:500});
 }
}