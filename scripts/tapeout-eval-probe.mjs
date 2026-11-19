#!/usr/bin/env node
/**
 * tapeout-eval-probe.mjs — read-only probe of live TapeOut circuits on
 * X Layer mainnet, proving the eval() transport the policy-circuit reader
 * (lib/tapeout-circuit.ts) relies on.
 *
 * No wallet, no transaction, no state change: only eth_call / eth_getCode
 * against public RPC endpoints.
 *
 * What it does:
 *   1. Resolves processor #245 and #268 addresses from the TapeOut factory
 *      (cpuAt) and cross-checks #245 against the address published in the
 *      21 NAND docs (0xA93E807fAB41431827EBBa57443Fb687a95E2AA3).
 *   2. Calls eval(uint256,bytes)(bytes) read-only on live circuits:
 *      circuits 1 and 3 on processor #245 (21 NAND / DOT32_T) and circuit 3
 *      on processor #268 (XBOT 3.2.268).
 *   3. As a control, calls the documented BNB example: circuit #279 on
 *      0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 with input 0xff7f.
 *
 * The probe prints RAW output bytes. These are other people's circuits; their
 * input widths and output layouts are unknown to us, so no bit is decoded as
 * an allow/deny decision here. A successful call proves the transport works:
 * the processor exists, eval() answers, and bytes come back. See
 * docs/TAPEOUT_POLICY_CIRCUIT.md for the recorded results.
 *
 * Exit code 0 when at least one X Layer eval() returned bytes, 1 otherwise.
 */

import {createPublicClient, getAddress, http} from "viem";
import {xLayer, bsc} from "viem/chains";

const XLAYER_RPC = "https://rpc.xlayer.tech";
const BSC_RPC = "https://bsc-rpc.publicnode.com";
const FACTORY_XLAYER = "0x1f09DAeFA827f02CBb40967cc91b259763760761";
const PROCESSOR_245_DOCUMENTED = "0xA93E807fAB41431827EBBa57443Fb687a95E2AA3";

const EVAL_ABI = [
  {
    type: "function",
    name: "eval",
    stateMutability: "view",
    inputs: [
      {name: "tokenId", type: "uint256"},
      {name: "bits", type: "bytes"},
    ],
    outputs: [{name: "", type: "bytes"}],
  },
];

const CPU_AT_ABI = [
  {
    type: "function",
    name: "cpuAt",
    stateMutability: "view",
    inputs: [{name: "index", type: "uint256"}],
    outputs: [{name: "", type: "address"}],
  },
];

function xlClient() {
  return createPublicClient({chain: xLayer, transport: http(XLAYER_RPC, {timeout: 30_000})});
}

function bscClient() {
  return createPublicClient({chain: bsc, transport: http(BSC_RPC, {timeout: 30_000})});
}

async function resolveProcessor(client, index) {
  try {
    const address = await client.readContract({
      address: FACTORY_XLAYER,
      abi: CPU_AT_ABI,
      functionName: "cpuAt",
      args: [BigInt(index)],
    });
    return getAddress(address);
  } catch (error) {
    console.log(`  cpuAt(${index}) failed: ${error.message.split("\n")[0]}`);
    return undefined;
  }
}

async function hasCode(client, address) {
  const code = await client.getCode({address});
  return code !== undefined && code !== "0x";
}

async function tryEval(client, label, processor, circuitId, input) {
  try {
    const output = await client.readContract({
      address: processor,
      abi: EVAL_ABI,
      functionName: "eval",
      args: [BigInt(circuitId), input],
    });
    console.log(`  OK   ${label} eval(${circuitId}, ${input}) -> ${output}`);
    return true;
  } catch (error) {
    console.log(`  FAIL ${label} eval(${circuitId}, ${input}): ${error.message.split("\n")[0]}`);
    return false;
  }
}

async function main() {
  const client = xlClient();
  let xlayerOk = false;

  console.log("TapeOut eval() probe — X Layer mainnet (chain 196), read-only");
  console.log(`RPC: ${XLAYER_RPC}`);
  console.log("");

  console.log(`Factory ${FACTORY_XLAYER}`);
  console.log(`  has code: ${await hasCode(client, FACTORY_XLAYER)}`);

  console.log("Resolving processors via factory cpuAt()...");
  const p245 = await resolveProcessor(client, 245);
  const p268 = await resolveProcessor(client, 268);
  console.log(`  processor #245: ${p245 ?? "(unresolved)"}`);
  console.log(`  processor #268: ${p268 ?? "(unresolved)"}`);
  if (p245) {
    console.log(
      `  #245 matches 21 NAND docs address: ${p245.toLowerCase() === PROCESSOR_245_DOCUMENTED.toLowerCase()}`
    );
  }
  console.log("");

  const processor245 = p245 ?? PROCESSOR_245_DOCUMENTED;
  console.log(`Probing processor #245 (${processor245})...`);
  console.log(`  has code: ${await hasCode(client, processor245)}`);
  for (const input of ["0xff7f", "0x00", "0x0000000000000000"]) {
    if (await tryEval(client, "3.2.245", processor245, 3, input)) xlayerOk = true;
  }
  for (const input of ["0xff7f", "0x00"]) {
    if (await tryEval(client, "1.2.245", processor245, 1, input)) xlayerOk = true;
  }
  console.log("");

  if (p268) {
    console.log(`Probing processor #268 (${p268})...`);
    console.log(`  has code: ${await hasCode(client, p268)}`);
    for (const input of ["0xff7f", "0x00"]) {
      if (await tryEval(client, "3.2.268 (XBOT)", p268, 3, input)) xlayerOk = true;
    }
    console.log("");
  }

  console.log("Control: documented BNB example, circuit #279 (0xff7f)...");
  const bnb = bscClient();
  const bnbProcessor = "0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38";
  console.log(`  has code: ${await hasCode(bnb, bnbProcessor)}`);
  const bnbOk = await tryEval(bnb, "279.732 (BNB)", bnbProcessor, 279, "0xff7f");
  console.log("");

  console.log(`X Layer eval() succeeded at least once: ${xlayerOk}`);
  console.log(`BNB control eval() succeeded: ${bnbOk}`);
  process.exit(xlayerOk ? 0 : 1);
}

main().catch((error) => {
  console.error(`Probe crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
