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
  redis.call("LPUSH",KEYS[3],ARGV[5])
  redis.call("LTRIM",KEYS[3],0,99)
  return {0,tostring(current),""}
end
redis.call("INCRBY",KEYS[1],amount)
redis.call("EXPIRE",KEYS[1],172800)
redis.call("SET",KEYS[2],ARGV[3],"EX",86400)
redis.call("LPUSH",KEYS[3],ARGV[4])
redis.call("LTRIM",KEYS[3],0,99)
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
export async function reserveSpend(args:{requestId:string;intentHash:string;amount:number;daily:number;activity?:Record<string,unknown>;now?:Date}):Promise<LedgerResult>{
  const now=args.now??new Date();
  const spendKey=`xaverus:spend:${dayKey(now)}`;
  const activityKey="xaverus:activity";
  const idKey=`xaverus:idempotency:${createHash("sha256").update(args.requestId).digest("hex")}`;
  const record=JSON.stringify({requestId:args.requestId,intentHash:args.intentHash,amount:args.amount,at:now.toISOString()});
  const activity=JSON.stringify(args.activity??{type:"authorization.reserved",requestId:args.requestId,intentHash:args.intentHash,amount:args.amount,at:now.toISOString()});
  const blockedActivity=JSON.stringify({type:"authorization.blocked",requestId:args.requestId,intentHash:args.intentHash,amount:args.amount,reason:"daily-spend-limit",at:now.toISOString()});
  const result=await command(["EVAL",SCRIPT,"3",spendKey,idKey,activityKey,String(micros(args.amount)),String(micros(args.daily)),record,activity,blockedActivity]) as unknown;
  if(!Array.isArray(result)||result.length<2)throw new Error("Invalid ledger response.");
  const code=Number(result[0]); const spent=Number(result[1])/1_000_000;
  if(code===2)return {status:"replayed",spentToday:spent,record:String(result[2]??"")};
  if(code===0)return {status:"blocked",spentToday:spent};
  return {status:"reserved",spentToday:spent,record:String(result[2]??"")};
}

export async function getActivity(limit=50){
  const n=Math.max(1,Math.min(100,Math.floor(limit)));
  const value=await command(["LRANGE","xaverus:activity","0",String(n-1)]);
  if(!Array.isArray(value))return [];
  return value.map((item)=>{try{return JSON.parse(String(item));}catch{return {type:"invalid.activity.record"};}});
}

export async function appendActivity(event:Record<string,unknown>){
  const payload=JSON.stringify(event);
  const result=await command(["EVAL","redis.call(\"LPUSH\",KEYS[1],ARGV[1]);redis.call(\"LTRIM\",KEYS[1],0,99);return 1","1","xaverus:activity",payload]);
  if(Number(result)!==1)throw new Error("Activity ledger write failed.");
}
