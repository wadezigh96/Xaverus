"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
type Passport={perTx:number;daily:number;approvalRequired:boolean;autoStop:boolean;enabled:boolean;asset:string;network:string;recipientAllowlistConfigured:boolean};
type Decision={allowed:boolean;reason:string};
export default function Safety(){
 const[p,setP]=useState<Passport|null>(null); const[a,setA]=useState("1"); const[recipient,setRecipient]=useState("");
 const[result,setResult]=useState<Decision|null>(null); const[loading,setLoading]=useState(false);
 useEffect(()=>{fetch("/api/agent/passport").then(r=>r.json()).then(x=>setP(x.policy)).catch(()=>setP(null));},[]);
 async function check(){
  setLoading(true); setResult(null);
  const id=(globalThis.crypto?.randomUUID?.()||("xv-"+Date.now()+"-"+Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9._:-]/g,"");
  try{
   const r=await fetch("/api/agent/safety-check",{method:"POST",headers:{"content-type":"application/json","x-xaverus-request-id":id},body:JSON.stringify({amount:Number(a),asset:p?.asset||"USDC",network:p?.network||"X Layer",recipient:recipient||undefined})});
   const data=await r.json(); setResult(data.decision||{allowed:false,reason:data.error||"Safety service unavailable."});
  }catch{setResult({allowed:false,reason:"Safety service unavailable."});}
  finally{setLoading(false);}
 }
 return <main className="market">
  <nav className="topnav"><Link href="/" className="brand">XAVERUS<span>SAFETY PASSPORT</span></Link><div className="navlinks"><a href="/">Marketplace</a><a href="/agents">My Agents</a><a className="active" href="/safety">Safety</a><a href="/activity">Activity</a></div></nav>
  <section className="marketHero"><div><div className="eyebrow">SERVER-AUTHORITATIVE POLICY</div><h1>Agents act.<br/><em>Policy decides.</em></h1><p>The browser can submit an intent, but it cannot replace the active Safety Passport policy.</p><Link className="secondary" href="/">Back to Marketplace</Link></div>
   <div className="launchCard"><span>SAFETY STATUS</span><strong>{p?p.enabled?"ACTIVE":"STOPPED":"LOADING"}</strong><p>Decision-only boundary. Execution remains outside this service.</p><div className="featureList"><span>✓ Server spend cap</span><span>✓ Server daily limit</span><span>✓ Asset/network policy</span><span>✓ Kill switch state</span></div></div>
  </section>
  <section className="agentGrid">
   <div className="agentCard"><span className="category">SERVER POLICY</span><h3>Safety Controls</h3>
    <p>Per transaction: <b>{p?.perTx??"—"} {p?.asset||""}</b></p><p>Daily limit: <b>{p?.daily??"—"} {p?.asset||""}</b></p><p>Approval required: <b>{p?p.approvalRequired?"YES":"NO":"—"}</b></p><p>Network: <b>{p?.network||"—"}</b></p><p>Recipient allowlist: <b>{p?p.recipientAllowlistConfigured?"CONFIGURED":"OPEN":"—"}</b></p><p className="category">Policy values are not editable from this untrusted browser.</p></div>
   <div className="agentCard"><span className="category">INTENT PREVIEW</span><h3>{result?result.allowed?"ALLOWED":"BLOCKED":"READY"}</h3><p>{result?.reason||"Submit an intent for a server-side decision."}</p>
    <label>Amount<input className="search" inputMode="decimal" value={a} onChange={e=>setA(e.target.value)}/></label>
    <label>Recipient<input className="search" placeholder="0x..." value={recipient} onChange={e=>setRecipient(e.target.value)} required/></label>
    <button className="primary" onClick={check} disabled={loading||!p}>{loading?"Checking…":"Run server policy check"}</button>
   </div>
  </section>
  <footer><span>XAVERUS · SAFETY PASSPORT</span><span>Server-authoritative · Decision-only</span></footer>
 </main>;
}
