"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";

type Agent={id:string;name:string;category:string;description:string;network:string;service:string;price:string;tags:string[]};

const AGENTS:Agent[]=[
 {id:"treasury-router",name:"Treasury Router",category:"FINANCE",description:"Routes approved treasury payment intents through a controlled execution boundary.",network:"X Layer",service:"A2MCP",price:"$0.01 / execution",tags:["Payment","Policy-aware","X Layer"]},
 {id:"data-sentinel",name:"Data Sentinel",category:"INTELLIGENCE",description:"Returns verified service results behind a machine-to-machine payment boundary.",network:"X Layer",service:"x402",price:"$0.01 / request",tags:["x402","Data","Agent"]},
 {id:"ops-guardian",name:"Ops Guardian",category:"OPERATIONS",description:"Monitors agent operations and surfaces policy exceptions before action.",network:"X Layer",service:"A2MCP",price:"Free",tags:["Monitoring","Safety","A2MCP"]}
];

export default function Home(){
 const [pass,setPass]=useState(false);
 const [query,setQuery]=useState("");
 const [active,setActive]=useState<Agent|null>(null);
 useEffect(()=>setPass(localStorage.getItem("xaverus_launch_pass")==="active"),[]);
 const filtered=useMemo(()=>AGENTS.filter(a=>(a.name+" "+a.category+" "+a.description+" "+a.tags.join(" ")).toLowerCase().includes(query.toLowerCase())),[query]);
 function launchPass(){localStorage.setItem("xaverus_launch_pass","active");setPass(true);}
 return <main className="market">
  <nav className="topnav"><Link href="/" className="brand">XAVERUS<span>AGENT MARKETPLACE</span></Link><div className="navlinks"><a className="active" href="/marketplace">Marketplace</a><a href="/agents">My Agents</a><a href="/safety">Safety</a><a href="/activity">Activity</a></div><div className="navright"><span className={pass?"live":"pill"}>{pass?"LAUNCH PASS ACTIVE":"LAUNCH PASS"}</span></div></nav>
  <section className="marketHero"><div><div className="eyebrow">USER-CONTROLLED AGENT MARKETPLACE</div><h1>Discover agents.<br/><em>Activate with control.</em></h1><p>Find autonomous services and give them bounded access through Xaverus Safety Passport — spend limits, approval gates and an emergency stop before execution.</p><div className="heroActions">{pass?<a className="primary" href="#agents">Explore agents</a>:<button className="primary" onClick={launchPass}>Get Launch Pass</button>}<a className="secondary" href="/safety">View Safety Passport</a></div></div><div className="launchCard"><span>LAUNCH PASS</span><strong>{pass?"ACTIVE":"READY"}</strong><p>{pass?"Marketplace access enabled.":"One-time launch access for the Xaverus marketplace."}</p><div className="featureList"><span>✓ Agent marketplace</span><span>✓ Agent credential</span><span>✓ Safety controls</span><span>✓ Activity history</span></div></div></section>
  <section id="agents" className="section"><div className="sectionHead"><div><div className="eyebrow">CURATED AGENTS</div><h2>Agent Marketplace</h2></div><input className="search" placeholder="Search agents..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <div className="agentGrid">{filtered.map(agent=><article className="agentCard" key={agent.id}><div className="agentTop"><span className="agentIcon">{agent.name.slice(0,1)}</span><span className="available">● AVAILABLE</span></div><span className="category">{agent.category}</span><h3>{agent.name}</h3><p>{agent.description}</p><div className="tags">{agent.tags.map(t=><span key={t}>{t}</span>)}</div><div className="agentMeta"><span>{agent.network} · {agent.service}</span><b>{agent.price}</b></div><button className="outline" onClick={()=>setActive(agent)}>View agent</button></article>)}</div>
  </section>
  <section className="controlBand"><div><div className="eyebrow">EVERY AGENT GETS A SAFETY BOUNDARY</div><h2>Marketplace access without giving up policy control.</h2></div><div className="controls"><span>Spend Cap</span><span>Daily Limit</span><span>Approval Gate</span><span>Kill Switch</span></div></section>
  <footer><span>XAVERUS · AGENT MARKETPLACE</span><span>OKX AI · A2MCP · x402 · X LAYER</span></footer>
  {active&&<div className="modal" onClick={()=>setActive(null)}><div className="modalCard" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setActive(null)}>×</button><span className="category">{active.category}</span><h2>{active.name}</h2><p>{active.description}</p><div className="detailRows"><div><span>NETWORK</span><b>{active.network}</b></div><div><span>SERVICE</span><b>{active.service}</b></div><div><span>PRICING</span><b>{active.price}</b></div></div><div className="safetyBox"><b>SAFETY COMPATIBLE</b><span>Spend cap · Approval gate · Kill switch</span></div>{pass?<button className="primary wide">Activate agent</button>:<button className="primary wide" onClick={launchPass}>Get Launch Pass</button>}</div></div>}
 </main>
}
