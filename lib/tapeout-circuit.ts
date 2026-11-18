import {createPublicClient, getAddress, http, type Address, type Hex} from "viem";
import {xLayer} from "viem/chains";
import {isProofValid, type HumanProof} from "./human-proof.ts";

/**
 * TapeOut policy circuit: local simulation plus the read-only eval() reader.
 * See docs/TAPEOUT_POLICY_CIRCUIT.md, ADR-0002, and GLOSSARY.md.
 *
 * The circuit answers one question: allow = xVerified AND uidClaimed AND NOT
 * revoked. It enforces the mint rule openly; it does NOT verify identity.
 * Identity verification (X OAuth, the signed OKX UID claim) happens off-chain
 * before the flag bits are handed to the circuit. A NAND circuit has no
 * network access and no oracle.
 */

export type CircuitInput = {
  xVerified: boolean;
  uidClaimed: boolean;
  revoked: boolean;
};

export type NetlistGate = {
  id: string;
  type: "NAND";
  inputs: [string, string];
  output: string;
};

export type PolicyNetlist = {
  name: string;
  inputs: string[];
  outputs: string[];
  gates: NetlistGate[];
};

function nand(a: boolean, b: boolean): boolean {
  return !(a && b);
}

/**
 * Pure simulation of a NAND-only netlist. Gates are evaluated in listed
 * order, which must be topological (every gate input is either a circuit
 * input or the output of an earlier gate). Throws on an unknown wire or an
 * unsupported gate type instead of guessing.
 */
export function simulate(netlist: PolicyNetlist, input: CircuitInput): boolean {
  const wires = new Map<string, boolean>([
    ["x", input.xVerified],
    ["u", input.uidClaimed],
    ["r", input.revoked],
  ]);
  for (const gate of netlist.gates) {
    if (gate.type !== "NAND") throw new Error(`Unsupported gate type: ${gate.type}. Only NAND is supported.`);
    const values = gate.inputs.map((wire) => {
      const value = wires.get(wire);
      if (value === undefined) throw new Error(`Unknown wire: ${wire} (gate ${gate.id}).`);
      return value;
    });
    wires.set(gate.output, nand(values[0], values[1]));
  }
  if (netlist.outputs.length !== 1) throw new Error("Policy netlist must have exactly one output.");
  const result = wires.get(netlist.outputs[0]);
  if (result === undefined) throw new Error(`Unknown wire: ${netlist.outputs[0]} (output).`);
  return result;
}

/**
 * Bit packing for the eval() call, documented in docs/TAPEOUT_POLICY_CIRCUIT.md.
 * The input is one byte: bit 0 = xVerified, bit 1 = uidClaimed, bit 2 =
 * revoked. Bits 3-7 are always 0. The output is read the same way: bit 0 of
 * the first output byte is the allow bit; any further output bytes are
 * ignored (the policy circuit produces exactly one bit).
 */
export function packCircuitInput(input: CircuitInput): Hex {
  const byte = (input.xVerified ? 1 : 0) | (input.uidClaimed ? 2 : 0) | (input.revoked ? 4 : 0);
  return `0x${byte.toString(16).padStart(2, "0")}` as Hex;
}

export function unpackCircuitInput(packed: Hex): CircuitInput {
  const byte = Number.parseInt(packed.slice(2, 4), 16);
  if (!Number.isInteger(byte)) throw new Error(`Invalid packed circuit input: ${packed}.`);
  return {xVerified: (byte & 1) !== 0, uidClaimed: (byte & 2) !== 0, revoked: (byte & 4) !== 0};
}

/** Bit 0 of the first output byte is the allow bit. Empty output is an error, never a denial. */
export function decodeCircuitOutput(output: Hex): boolean {
  if (!output || output === "0x" || output.length < 4) {
    throw new Error("TapeOut eval returned empty output; cannot read the allow bit.");
  }
  return (Number.parseInt(output.slice(2, 4), 16) & 1) !== 0;
}

export const XLAYER_RPC_URL = "https://rpc.xlayer.tech";
export const POLICY_CIRCUIT_EVAL_TIMEOUT_MS = 30_000;

/**
 * eval() as documented by 21 NAND docs (cast call "eval(uint256,bytes)(bytes)").
 * Read-only: this never signs or sends a transaction. Note the honesty bound
 * from docs/TAPEOUT_RESEARCH.md §8: the off-chain read-only pattern is
 * documented, but no canonical ABI for calling eval() from inside another
 * contract is confirmed, so the backend calls it read-only instead.
 */
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
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Evaluate the policy circuit read-only through a TapeOut processor's
 * eval(). Returns the allow bit. Every failure mode throws a clear Error:
 * no code at the processor, a reverted call, an unreachable RPC, or empty
 * output. A failure is never reported as a denial, because a denial would
 * look like a policy decision when it is really an outage.
 */
export async function evalPolicyCircuit(args: {
  processor: string;
  circuitId: number | bigint;
  xVerified: boolean;
  uidClaimed: boolean;
  revoked: boolean;
  rpcUrl?: string;
}): Promise<boolean> {
  let processor: Address;
  try {
    processor = getAddress(args.processor);
  } catch {
    throw new Error(`TapeOut eval: invalid processor address: ${args.processor}`);
  }
  const client = createPublicClient({
    chain: xLayer,
    transport: http(args.rpcUrl ?? XLAYER_RPC_URL, {timeout: POLICY_CIRCUIT_EVAL_TIMEOUT_MS}),
  });
  let code: Hex | undefined;
  try {
    code = await client.getCode({address: processor});
  } catch (error) {
    throw new Error(
      `TapeOut eval: could not read code at processor ${processor}: ${errorMessage(error)}`
    );
  }
  if (!code || code === "0x") {
    throw new Error(
      `TapeOut eval: no contract code at processor ${processor}; check the address and the RPC.`
    );
  }
  let output: Hex;
  try {
    output = await client.readContract({
      address: processor,
      abi: EVAL_ABI,
      functionName: "eval",
      args: [
        BigInt(args.circuitId),
        packCircuitInput({xVerified: args.xVerified, uidClaimed: args.uidClaimed, revoked: args.revoked}),
      ],
    });
  } catch (error) {
    throw new Error(
      `TapeOut eval: eval() call to processor ${processor} circuit ${args.circuitId} failed: ${errorMessage(error)}`
    );
  }
  return decodeCircuitOutput(output);
}

/**
 * Map a stored Human Proof to circuit inputs. A Human Proof exists only when
 * both halves completed (the X Binding and the signed OKX UID claim, enforced
 * by the proof store), so a structurally valid proof sets both flags; no
 * proof, or a malformed one, sets neither. Revocation defaults to false in
 * v1: revoking or replacing a Human Proof after minting is out of scope
 * (SPEC.md), so the caller passes `revoked` only when a later version knows
 * the proof was revoked.
 */
export function proofToCircuitInput(proof: HumanProof | undefined, revoked = false): CircuitInput {
  const valid = proof !== undefined && isProofValid(proof);
  return {xVerified: valid, uidClaimed: valid, revoked};
}
