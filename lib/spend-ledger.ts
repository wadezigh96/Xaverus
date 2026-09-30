import {createHash} from "node:crypto";

type LedgerResult={status:"reserved"|"replayed"|"blocked";spentToday:number;record?:string};

const SCRIPT=`
local existing=redis.call("GET",KEYS[2])
if existing then
  return {2,redis.call("GET",KEYS[1]) or "0",existing}
end
local current=tonumber(redis.call("GET",KEYS[1]) or "0")
local amount=tonumber(ARGV[1])
local daily=tonumber(ARGV[2])
if current+amount>daily then
  return {0,tostring(current),""}
end
redis.call("INCRBY",KEYS[1],amount)
redis.call("EXPIRE",KEYS[1],172800)
redis.call("SET",KEYS[2],ARGV[3],"EX",86400)
return {1,tostring(current+amount),ARGV[3]}
`;

function config(){
  const url=process.env.UPSTASH_REDIS_REST_URL;
  const token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!token)throw new Error("Persistent spend ledger is not configured.");
  return {url:url.replace(/\\/$/,""),token};
}
function micros(value:number){
  if(!Number.isFinite(value)||value<0)throw new Error("Invalid monetary value.");
  return Math.round(value*1_000_000);
}
function dayKey(now=new Date()){return now.toISOString().slice(0,10);}
async function command(args:unknown[]){
  const {url,token}=config();
  const r=await fetch(url,{method:"POST",headers:{"authorization":`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(args),cache:"no-store"});
  if(!r.ok)throw new Error(`Ledger HTTP ${r.status}`);
  const data=await r.json() as {result?:unknown;error?:string};
  if(data.error)throw new Error(data.error);
  return data.result;
}
export async function getSpentToday(now=new Date()){
  const value=await command(["GET",`xaverus:spend:${dayKey(now)}`]);
  return Number(value??0)/1_000_000;
}
export async function reserveSpend(args:{requestId:string;intentHash:string;amount:number;daily:number;now?:Date}):Promise<LedgerResult>{
  const now=args.now??new Date();
  const spendKey=`xaverus:spend:${dayKey(now)}`;
  const idKey=`xaverus:idempotency:${createHash("sha256").update(args.requestId).digest("hex")}`;
  const record=JSON.stringify({requestId:args.requestId,intentHash:args.intentHash,amount:args.amount,at:now.toISOString()});
  const result=await command(["EVAL",SCRIPT,"2",spendKey,idKey,String(micros(args.amount)),String(micros(args.daily)),record]) as unknown;
  if(!Array.isArray(result)||result.length<2)throw new Error("Invalid ledger response.");
  const code=Number(result[0]); const spent=Number(result[1])/1_000_000;
  if(code===2)return {status:"replayed",spentToday:spent,record:String(result[2]??"")};
  if(code===0)return {status:"blocked",spentToday:spent};
  return {status:"reserved",spentToday:spent,record:String(result[2]??"")};
}
