export type SafetyPolicy = {
  perTx: number; daily: number; approvalRequired: boolean; autoStop: boolean; enabled: boolean;
  asset: string; network: string; recipientAllowlist: string[];
};
export const DEFAULT_POLICY: SafetyPolicy = {
  perTx: 5, daily: 25, approvalRequired: true, autoStop: true, enabled: true,
  asset: "USDC", network: "X Layer", recipientAllowlist: []
};
function positiveFinite(value:number,fallback:number){return Number.isFinite(value)&&value>=0?value:fallback;}
function csv(value:string|undefined){return (value??"").split(",").map(v=>v.trim()).filter(Boolean);}
export function getServerPolicy():SafetyPolicy{
  const raw=process.env.XAVERUS_POLICY_JSON;
  if(raw){try{
    const p=JSON.parse(raw) as Partial<SafetyPolicy>;
    return {
      perTx:positiveFinite(Number(p.perTx),DEFAULT_POLICY.perTx),
      daily:positiveFinite(Number(p.daily),DEFAULT_POLICY.daily),
      approvalRequired:p.approvalRequired??DEFAULT_POLICY.approvalRequired,
      autoStop:p.autoStop??DEFAULT_POLICY.autoStop,
      enabled:p.enabled??DEFAULT_POLICY.enabled,
      asset:typeof p.asset==="string"?p.asset:DEFAULT_POLICY.asset,
      network:typeof p.network==="string"?p.network:DEFAULT_POLICY.network,
       recipientAllowlist:Array.isArray(p.recipientAllowlist)?p.recipientAllowlist.map(String).map(v=>v.trim()).filter(Boolean):csv(process.env.XAVERUS_RECIPIENT_ALLOWLIST)
    };
  }catch{}}
  return {
    perTx:positiveFinite(Number(process.env.XAVERUS_PER_TX_LIMIT),DEFAULT_POLICY.perTx),
    daily:positiveFinite(Number(process.env.XAVERUS_DAILY_LIMIT),DEFAULT_POLICY.daily),
    approvalRequired:process.env.XAVERUS_APPROVAL_REQUIRED!=="false",
    autoStop:process.env.XAVERUS_AUTO_STOP!=="false",
    enabled:process.env.XAVERUS_SAFETY_ENABLED!=="false",
    asset:process.env.XAVERUS_ASSET||DEFAULT_POLICY.asset,
    network:process.env.XAVERUS_NETWORK||DEFAULT_POLICY.network,
    recipientAllowlist:csv(process.env.XAVERUS_RECIPIENT_ALLOWLIST)
  };
}
export type PaymentIntent={amount:number;spentToday:number;asset:string;network:string;recipient?:string};
export function evaluatePayment(intent:PaymentIntent,policy:SafetyPolicy){
  if(!policy.enabled)return {allowed:false,reason:"Safety Passport is stopped by the kill switch."};
  if(!Number.isFinite(intent.amount)||intent.amount<=0)return {allowed:false,reason:"Amount must be greater than zero."};
  if(!Number.isFinite(intent.spentToday)||intent.spentToday<0)return {allowed:false,reason:"Server spend ledger is invalid."};
  if(intent.asset!==policy.asset)return {allowed:false,reason:"Asset is not allowed by this Safety Passport."};
  if(intent.network!==policy.network)return {allowed:false,reason:"Network is not allowed by this Safety Passport."};
  if(intent.amount>policy.perTx)return {allowed:false,reason:"Transaction exceeds the per-transaction limit."};
  if(intent.spentToday+intent.amount>policy.daily)return {allowed:false,reason:"Transaction exceeds the daily spending limit."};
  if(policy.recipientAllowlist.length>0&&(!intent.recipient||!policy.recipientAllowlist.includes(intent.recipient)))return {allowed:false,reason:"Recipient is not in the Safety Passport allowlist."};
  return {allowed:true,reason:"Policy checks passed."};
}
