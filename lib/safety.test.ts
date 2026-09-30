import test from "node:test";
import assert from "node:assert/strict";
import {evaluatePayment} from "./safety.ts";

const policy={perTx:5,daily:25,approvalRequired:true,autoStop:true,enabled:true,asset:"USDC",network:"X Layer",recipientAllowlist:[]};

test("allows a valid intent",()=>assert.equal(evaluatePayment({amount:1,spentToday:0,asset:"USDC",network:"X Layer"},policy).allowed,true));
test("blocks per-transaction overflow",()=>assert.equal(evaluatePayment({amount:6,spentToday:0,asset:"USDC",network:"X Layer"},policy).allowed,false));
test("blocks daily overflow",()=>assert.equal(evaluatePayment({amount:3,spentToday:23,asset:"USDC",network:"X Layer"},policy).allowed,false));
test("blocks wrong asset",()=>assert.equal(evaluatePayment({amount:1,spentToday:0,asset:"USDT",network:"X Layer"},policy).allowed,false));
test("blocks wrong network",()=>assert.equal(evaluatePayment({amount:1,spentToday:0,asset:"USDC",network:"Ethereum"},policy).allowed,false));
test("blocks non-allowlisted recipient",()=>{
 const p={...policy,recipientAllowlist:["0xallowed"]};
 assert.equal(evaluatePayment({amount:1,spentToday:0,asset:"USDC",network:"X Layer",recipient:"0xother"},p).allowed,false);
});
