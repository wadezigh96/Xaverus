import {readAuthorizationLogs} from "../../lib/onchain-passport";

export const dynamic="force-dynamic";

export default async function Activity(){
  let events:Awaited<ReturnType<typeof readAuthorizationLogs>>=[];
  let error="";
  try{events=await readAuthorizationLogs(50);}catch(e){error=e instanceof Error?e.message:"On-chain activity unavailable."}

  return <main className="market"><nav className="topnav"><a className="brand" href="/">XAVERUS<span>ACTIVITY</span></a><div className="navlinks"><a href="/">Marketplace</a><a href="/agents">My Agents</a><a href="/safety">Safety</a><a className="active" href="/activity">Activity</a></div></nav><section className="section"><div className="eyebrow">ON-CHAIN AUDIT</div><h1>Activity <em>Ledger.</em></h1><p>Authorization records are read directly from the X Layer Safety Passport contract. They are not fabricated and are not proof of a token transfer.</p>{error?<div className="notice">{error}</div>:events.length===0?<div className="notice">No on-chain authorization events yet.</div>:<div className="activityList">{events.map((e,i)=><article className="activityRow" key={e.transactionHash??i}><div><strong className="good">AUTHORIZED</strong><span>{e.amount} USDC → {e.recipient}</span></div><small>{e.transactionHash??"pending"} · block {e.blockNumber??"—"}</small></article>)}</div>}<p className="muted">Execution boundary: external wallet · Signing/broadcasting by Xaverus server: disabled.</p></section></main>}
