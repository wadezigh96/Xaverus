export type PaymentIntent={amount:number;asset:"USDC";network:"X Layer";recipient:string;memo?:string};
export type IntegrationStatus={name:string;configured:boolean;mode:"demo-safe"|"live"};
export function integrationStatus():IntegrationStatus[]{
 const keys=["OKX_PROJECT_ID","OKX_API_KEY","OKX_API_SECRET","OKX_API_PASSPHRASE"] as const;
 const configured=keys.every(k=>Boolean(process.env[k]));
 return [
  {name:"OKX AI service",configured,mode:configured?"live":"demo-safe"},
  {name:"OKX Agentic Wallet",configured,mode:configured?"live":"demo-safe"},
  {name:"OKX Agent Payments",configured,mode:configured?"live":"demo-safe"},
  {name:"X Layer execution",configured,mode:configured?"live":"demo-safe"}
 ];
}
export function validateIntent(i:PaymentIntent){return i.network==="X Layer"&&i.asset==="USDC"&&i.amount>0&&Boolean(i.recipient);}