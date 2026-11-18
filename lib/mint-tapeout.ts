import {
  evalPolicyCircuit,
  proofToCircuitInput,
  type CircuitInput,
} from "./tapeout-circuit.ts";
import {proofHash, type HumanProof} from "./human-proof.ts";
import {getTapeOutEvalLog} from "./tapeout-eval-log.ts";

/**
 * The TapeOut half of the mint decision (ADR-0002): when a policy circuit is
 * configured, the mint flow evaluates it read-only and records the result
 * persistently in the eval log (lib/tapeout-eval-log.ts), so the decision
 * leaves an audit trail beyond the HTTP response. When nothing is
 * configured, the check is skipped openly — the mint response says so —
 * because our own circuit is not taped out yet.
 *
 * An eval failure is never a denial: it throws, and the caller turns it
 * into a 503, because an outage must not look like a policy decision.
 * A failed eval-log write is different: it is logged loudly and the mint
 * proceeds, because a broken audit log must not look like a denied mint
 * either.
 */

export type TapeOutConfig = {
  processor: string;
  circuitId: bigint;
  rpcUrl?: string;
};

export type TapeOutCheck =
  | {configured: false}
  | {
      configured: true;
      circuitId: string;
      processor: string;
      allowed: boolean;
      evaluatedAt: number;
    };

export type EvalPolicyCircuitFn = (args: {
  processor: string;
  circuitId: number | bigint;
  rpcUrl?: string;
} & CircuitInput) => Promise<boolean>;

/** Read the circuit config from env. Undefined when nothing is configured. */
export function getTapeOutConfig(env: NodeJS.ProcessEnv = process.env): TapeOutConfig | undefined {
  const processor = env.XAVERUS_TAPEOUT_PROCESSOR?.trim();
  const circuitId = env.XAVERUS_TAPEOUT_CIRCUIT_ID?.trim();
  if (!processor && !circuitId) return undefined;
  if (!processor || !circuitId) {
    throw new Error(
      "TapeOut is half-configured: set both XAVERUS_TAPEOUT_PROCESSOR and XAVERUS_TAPEOUT_CIRCUIT_ID."
    );
  }
  let id: bigint;
  try {
    id = BigInt(circuitId);
  } catch {
    throw new Error(`TapeOut circuit id must be a number, got: ${circuitId}`);
  }
  if (id < 0n) throw new Error("TapeOut circuit id must not be negative.");
  const rpcUrl = env.XAVERUS_TAPEOUT_RPC_URL?.trim();
  return rpcUrl ? {processor, circuitId: id, rpcUrl} : {processor, circuitId: id};
}

/**
 * Evaluate the policy circuit for a proof. With no config, returns
 * {configured: false} without touching the network. With a config, calls
 * eval() read-only and returns the allow bit with the circuit's identity.
 */
export async function checkPolicyCircuit(
  proof: HumanProof,
  config: TapeOutConfig | undefined,
  evalFn: EvalPolicyCircuitFn = evalPolicyCircuit
): Promise<TapeOutCheck> {
  if (!config) return {configured: false};
  const input = proofToCircuitInput(proof);
  const allowed = await evalFn({
    processor: config.processor,
    circuitId: config.circuitId,
    rpcUrl: config.rpcUrl,
    ...input,
  });
  const evaluatedAt = Math.floor(Date.now() / 1000);
  try {
    getTapeOutEvalLog().record({
      proofHash: proofHash(proof),
      circuitId: config.circuitId.toString(),
      processor: config.processor,
      xVerified: input.xVerified,
      uidClaimed: input.uidClaimed,
      revoked: input.revoked,
      allowed,
      evaluatedAt,
    });
  } catch (error) {
    console.error(
      "TapeOut eval log write failed:",
      error instanceof Error ? error.message : "unknown error"
    );
  }
  return {
    configured: true,
    circuitId: config.circuitId.toString(),
    processor: config.processor,
    allowed,
    evaluatedAt,
  };
}
