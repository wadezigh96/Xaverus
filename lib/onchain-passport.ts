import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseUnits,
  toBytes,
  type Address,
  type Hex,
} from "viem";

export const XLAYER_CHAIN_ID = 196;
export const XLAYER_RPC = process.env.XAVERUS_RPC_URL || "https://rpc.xlayer.tech";

export const XAVERUS_PASSPORT_ABI = parseAbi([
  "function owner() view returns (address)",
  "function asset() view returns (address)",
  "function perTxLimit() view returns (uint256)",
  "function dailyLimit() view returns (uint256)",
  "function enabled() view returns (bool)",
  "function allowlistEnabled() view returns (bool)",
  "function spentToday() view returns (uint256)",
  "function remainingToday() view returns (uint256)",
  "function recipientAllowed(address) view returns (bool)",
  "function authorize(bytes32 requestId,uint256 amount,address token,address recipient)",
  "event AuthorizationRecorded(bytes32 indexed requestId,address indexed owner,address indexed recipient,uint256 amount,uint256 day,uint256 spentToday)",
]);

function addressFromEnv() {
  const value = process.env.XAVERUS_PASSPORT_CONTRACT;
  if (!value) throw new Error("XAVERUS_PASSPORT_CONTRACT is not configured.");
  return getAddress(value) as Address;
}

function client() {
  return createPublicClient({
    chain: {
      id: XLAYER_CHAIN_ID,
      name: "X Layer",
      nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
      rpcUrls: { default: { http: [XLAYER_RPC] } },
    },
    transport: http(XLAYER_RPC),
  });
}

export type OnchainPolicy = {
  owner: Address;
  asset: Address;
  perTx: number;
  daily: number;
  enabled: boolean;
  allowlistEnabled: boolean;
  spentToday: number;
  remainingToday: number;
};

export async function readOnchainPolicy(): Promise<OnchainPolicy> {
  const address = addressFromEnv();
  const c = client();
  const [owner, asset, perTx, daily, enabled, allowlistEnabled, spentToday, remainingToday] =
    await Promise.all([
      c.readContract({ address, abi: XAVERUS_PASSPORT_ABI, functionName: "owner" }),
      c.readContract({ address, abi: XAVERUS_PASSPORT_ABI, functionName: "asset" }),
      c.readContract({ address, abi: XAVERUS_PASSPORT_ABI, functionName: "perTxLimit" }),
      c.readContract({ address, abi: XAVERUS_PASSPORT_ABI, functionName: "dailyLimit" }),
      c.readContract({ address, abi: XAVERUS_PASSPORT_ABI, functionName: "enabled" }),
      c.readContract({ address, abi: XAVERUS_PASSPORT_ABI, functionName: "allowlistEnabled" }),
      c.readContract({ address, abi: XAVERUS_PASSPORT_ABI, functionName: "spentToday" }),
      c.readContract({ address, abi: XAVERUS_PASSPORT_ABI, functionName: "remainingToday" }),
    ]);

  return {
    owner: owner as Address,
    asset: asset as Address,
    perTx: Number(perTx) / 1_000_000,
    daily: Number(daily) / 1_000_000,
    enabled: Boolean(enabled),
    allowlistEnabled: Boolean(allowlistEnabled),
    spentToday: Number(spentToday) / 1_000_000,
    remainingToday: Number(remainingToday) / 1_000_000,
  };
}

export async function readRecipientAllowed(recipient: string) {
  const address = addressFromEnv();
  const c = client();
  return Boolean(await c.readContract({
    address,
    abi: XAVERUS_PASSPORT_ABI,
    functionName: "recipientAllowed",
    args: [getAddress(recipient)],
  }));
}

export async function buildOnchainAuthorization(args: {
  requestId: string;
  amount: number;
  recipient: string;
  walletAddress: string;
}) {
  const passport = addressFromEnv();
  const policy = await readOnchainPolicy();
  const wallet = getAddress(args.walletAddress);
  const recipient = getAddress(args.recipient);
  if (wallet !== policy.owner) throw new Error("Wallet does not own this Safety Passport.");
  if (!Number.isFinite(args.amount) || args.amount <= 0) throw new Error("Invalid amount.");
  const amount = parseUnits(String(args.amount), 6);
  const requestId = keccak256(toBytes(args.requestId));

  const data = encodeFunctionData({
    abi: XAVERUS_PASSPORT_ABI,
    functionName: "authorize",
    args: [requestId, amount, policy.asset, recipient],
  });

  return {
    to: passport,
    data: data as Hex,
    value: "0x0" as Hex,
    chainId: XLAYER_CHAIN_ID,
    requestId,
    token: policy.asset,
    amount: amount.toString(),
  };
}

export async function readAuthorizationLogs(limit = 50) {
  const address = addressFromEnv();
  const c = client();
  const deploymentBlock = process.env.XAVERUS_PASSPORT_DEPLOYMENT_BLOCK;
  const logs = await c.getLogs({
    address,
    event: XAVERUS_PASSPORT_ABI[10],
    fromBlock: deploymentBlock ? BigInt(deploymentBlock) : 0n,
    toBlock: "latest",
  });
  return logs.slice(-Math.max(1, Math.min(100, Math.floor(limit)))).reverse().map((log) => ({
    type: "authorization.onchain",
    requestId: log.args.requestId,
    owner: log.args.owner,
    recipient: log.args.recipient,
    amount: Number(log.args.amount ?? 0n) / 1_000_000,
    day: Number(log.args.day ?? 0n),
    spentToday: Number(log.args.spentToday ?? 0n) / 1_000_000,
    blockNumber: log.blockNumber?.toString() ?? null,
    transactionHash: log.transactionHash ?? null,
  }));
}
