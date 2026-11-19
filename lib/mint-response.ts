import {proofHash, type HumanProof} from "./human-proof.ts";

/**
 * Shared response shapes for the mint API routes. The public proof shape
 * and the claim note live here so the routes cannot drift apart: every
 * surface says the same thing about the OKX UID.
 */

/** ADR-0001: the OKX UID is a user-signed claim, never a verification by OKX. */
export const UID_CLAIM_NOTE = "The OKX UID is a user-signed claim, not a verification by OKX.";

export type PublicProof = {
  wallet: string;
  xUserId: string;
  xHandleHash: string;
  okxUidHash: string;
  issuedAt: number;
  proofHash: string;
};

/** The public shape of a proof: hashes only, never the raw UID or signature. */
export function publicProof(proof: HumanProof): PublicProof {
  return {
    wallet: proof.wallet,
    xUserId: proof.xUserId,
    xHandleHash: proof.xHandleHash,
    okxUidHash: proof.okxUidHash,
    issuedAt: proof.issuedAt,
    proofHash: proofHash(proof),
  };
}
