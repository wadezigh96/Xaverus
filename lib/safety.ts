export type SafetyPolicy={perTx:number;daily:number;approvalRequired:boolean;autoStop:boolean;enabled:boolean};
export const DEFAULT_POLICY:SafetyPolicy={perTx:5,daily:25,approvalRequired:true,autoStop:true,enabled:true};
export function evaluatePayment(amount:number,spentToday:number,policy:SafetyPolicy){
 if(!policy.enabled)return {allowed:false,reason:"Safety Passport is stopped by the kill switch."};
 if(amount<=0)return {allowed:false,reason:"Amount must be greater than zero."};
 if(amount>policy.perTx)return {allowed:false,reason:"Transaction exceeds the per-transaction limit."};
 if(spentToday+amount>policy.daily)return {allowed:false,reason:"Transaction exceeds the daily spending limit."};
 return {allowed:true,reason:"Policy checks passed."}
}