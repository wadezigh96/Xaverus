/**
 * XaverusPassport deploy helper for X Layer mainnet (196).
 *
 * Modes:
 *  1) No PRIVATE_KEY → prints constructor args + cast/forge commands (safe default)
 *  2) PRIVATE_KEY set → deploys via viem and prints the contract address
 *
 * Never commit PRIVATE_KEY. Use a throwaway or hardware-backed key for the owner wallet.
 */
import { createWalletClient, http, encodeDeployData, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CHAIN_ID = 196;
const RPC = process.env.XAVERUS_RPC_URL || process.env.RPC_URL || "https://rpc.xlayer.tech";
const NATIVE_USDC = "0xB6CEceAB302E2E4948951eE7843FC24e92933061";
const PER_TX = 5_000_000n; // 5 USDC (6 decimals)
const DAILY = 25_000_000n; // 25 USDC

const xlayer = {
  id: CHAIN_ID,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

console.log("XaverusPassport deploy helper");
console.log("Chain:", CHAIN_ID, "RPC:", RPC);
console.log("Asset (native USDC):", NATIVE_USDC);
console.log("perTxLimit:", PER_TX.toString(), "(5 USDC)");
console.log("dailyLimit:", DAILY.toString(), "(25 USDC)");
console.log("");

const pk = process.env.PRIVATE_KEY || process.env.XAVERUS_DEPLOYER_PRIVATE_KEY;

if (!pk) {
  console.log("PRIVATE_KEY not set — printing deploy commands only.\n");
  console.log("Foundry cast:");
  console.log(`  cast create contracts/XaverusPassport.sol:XaverusPassport \\`);
  console.log(`    --rpc-url ${RPC} \\`);
  console.log(`    --private-key $PRIVATE_KEY \\`);
  console.log(`    ${NATIVE_USDC} ${PER_TX.toString()} ${DAILY.toString()}`);
  console.log("");
  console.log("Then set:");
  console.log("  XAVERUS_PASSPORT_CONTRACT=<deployed_address>");
  console.log("  XAVERUS_PASSPORT_DEPLOYMENT_BLOCK=<block_number>");
  process.exit(0);
}

// Optional bytecode path if precompiled with forge
const bytecodePath = process.env.PASSPORT_BYTECODE_PATH;
if (!bytecodePath) {
  console.error(
    "Deploy with PRIVATE_KEY requires PASSPORT_BYTECODE_PATH pointing to compiled creation bytecode,"
  );
  console.error("or use the cast command printed when PRIVATE_KEY is unset.");
  console.error("Example after `forge build`:");
  console.error(
    "  PASSPORT_BYTECODE_PATH=out/XaverusPassport.sol/XaverusPassport.json node scripts/deploy-passport.mjs"
  );
  process.exit(1);
}

const artifact = JSON.parse(readFileSync(resolve(bytecodePath), "utf8"));
const bytecode = artifact.bytecode?.object || artifact.bytecode;
if (!bytecode || typeof bytecode !== "string") {
  console.error("Could not read bytecode.object from", bytecodePath);
  process.exit(1);
}

const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
const client = createWalletClient({
  account,
  chain: xlayer,
  transport: http(RPC),
});

const data = encodeDeployData({
  abi: artifact.abi,
  bytecode,
  args: [getAddress(NATIVE_USDC), PER_TX, DAILY],
});

console.log("Deploying from:", account.address);
const hash = await client.sendTransaction({ data, chain: xlayer });
console.log("tx hash:", hash);
console.log("Wait for confirmation on the explorer, then set XAVERUS_PASSPORT_CONTRACT.");
