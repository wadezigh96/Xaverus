import {createHash} from "node:crypto";

export const X_LAYER_MAINNET_CHAIN_ID=196;

export function passportIntentHash(args:{requestId:string;amount:number;asset:string;network:string;recipient?:string}){
  return createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

export function getPassportContractAddress(){
  const value=process.env.XAVERUS_PASSPORT_CONTRACT?.trim();
  return value||null;
}

export function passportChainStatus(){
  const address=getPassportContractAddress();
  return {configured:Boolean(address),chainId:X_LAYER_MAINNET_CHAIN_ID,contract:address,mode:address?"onchain-policy-ready":"onchain-policy-unconfigured"};
}
