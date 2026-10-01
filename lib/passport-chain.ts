import {createHash} from "node:crypto";

export const X_LAYER_MAINNET_CHAIN_ID=196;
export const XAVERUS_PASSPORT_CONTRACT="0xd6c426f9c077358735622ae5a83468dc0510823b";
export const XAVERUS_OWNER_WALLET="0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03";

export function passportIntentHash(args:{requestId:string;amount:number;asset:string;network:string;recipient?:string}){
  return createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

export function getPassportContractAddress(){
  const value=process.env.XAVERUS_PASSPORT_CONTRACT?.trim();
  return value||XAVERUS_PASSPORT_CONTRACT;
}

export function passportChainStatus(){
  const address=getPassportContractAddress();
  return {configured:true,chainId:X_LAYER_MAINNET_CHAIN_ID,contract:address,owner:XAVERUS_OWNER_WALLET,mode:"onchain-policy-ready"};
}
