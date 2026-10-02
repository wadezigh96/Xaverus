export type PaymentIntent={
  amount:number;
  asset:"USDC";
  network:"X Layer";
  recipient:string;
  memo?:string
};

export type IntegrationStatus={
  name:string;
  configured:boolean;
  mode:"not-configured"|"live"|"external-wallet"
};

export function integrationStatus():IntegrationStatus[]{
  const keys=[
    "OKX_PROJECT_ID",
    "OKX_API_KEY",
    "OKX_API_SECRET",
    "OKX_API_PASSPHRASE"
  ] as const;

  const okxConfigured=keys.every(k=>Boolean(process.env[k]));

  return [
    {
      name:"OKX AI service",
      configured:okxConfigured,
      mode:okxConfigured?"live":"not-configured"
    },
    {
      name:"OKX Agentic Wallet",
      configured:okxConfigured,
      mode:okxConfigured?"live":"not-configured"
    },
    {
      name:"OKX Agent Payments",
      configured:okxConfigured,
      mode:okxConfigured?"live":"not-configured"
    },
    {
      name:"X Layer execution",
      configured:false,
      mode:"external-wallet"
    }
  ];
}

export function validateIntent(i:PaymentIntent){
  return i.network==="X Layer"&&
    i.asset==="USDC"&&
    i.amount>0&&
    Boolean(i.recipient);
}
