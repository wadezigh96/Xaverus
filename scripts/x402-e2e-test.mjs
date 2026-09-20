const endpoint=process.env.XAVERUS_X402_URL||"https://xaverus.vercel.app/api/x402/service";
const signature=process.env.PAYMENT_SIGNATURE;

function decode(value){
  const normalized=value.replace(/-/g,"+").replace(/_/g,"/");
  return JSON.parse(Buffer.from(normalized,"base64").toString("utf8"));
}

function pickHeader(headers){
  return headers.get("payment-required")||headers.get("PAYMENT-REQUIRED");
}

async function main(){
  console.log("Xaverus x402 E2E probe");
  console.log("Endpoint:",endpoint);

  const first=await fetch(endpoint);
  const paymentRequired=pickHeader(first.headers);

  if(first.status!==402){
    const body=await first.text();
    throw new Error(`Expected HTTP 402, got ${first.status}. Body: ${body.slice(0,500)}`);
  }
  if(!paymentRequired){
    throw new Error("HTTP 402 received, but PAYMENT-REQUIRED header is missing.");
  }

  const challenge=decode(paymentRequired);
  const accepted=challenge.accepts?.[0];

  console.log("HTTP 402: OK");
  console.log("x402Version:",challenge.x402Version);
  console.log("Network:",accepted?.network);
  console.log("Scheme:",accepted?.scheme);
  console.log("Asset:",accepted?.asset);
  console.log("Amount:",accepted?.amount);
  console.log("PayTo:",accepted?.payTo);
  console.log("Resource:",challenge.resource?.url);

  if(!signature){
    console.log("");
    console.log("Buyer signing step: NOT RUN");
    console.log("Provide PAYMENT_SIGNATURE from an authorized x402 buyer/Agentic Wallet, then rerun this script.");
    process.exit(0);
  }

  const second=await fetch(endpoint,{
    headers:{"PAYMENT-SIGNATURE":signature}
  });
  const body=await second.text();

  console.log("");
  console.log("Replay HTTP status:",second.status);
  console.log("Response:",body);

  if(second.status!==200){
    throw new Error("Payment replay did not return HTTP 200.");
  }

  try{
    const parsed=JSON.parse(body);
    console.log("txHash:",parsed.payment?.txHash||parsed.txHash||"not returned");
  }catch{}
}

main().catch(error=>{
  console.error("E2E probe failed:",error.message);
  process.exit(1);
});
