// Xaverus policy circuit (TapeOut, X Layer Build X Series).
//
// allow = x_verified AND uid_claimed AND NOT revoked
//
// Inputs are three flag bits produced OFF-CHAIN by the Xaverus backend:
//   x_verified  - the minting wallet completed X OAuth and signed the binding
//   uid_claimed - the minting wallet signed its OKX UID claim
//   revoked     - the Human Proof has been revoked (always 0 in v1; revocation
//                 is out of scope, see SPEC.md)
//
// The circuit enforces the mint rule openly: anyone can read this file, run
// it, and check the answer. It does NOT verify identity. A NAND circuit has
// no network access and no oracle; it cannot call the X or OKX APIs. Identity
// verification happens off-chain, before the bits are handed to the circuit.
// See docs/TAPEOUT_POLICY_CIRCUIT.md and ADR-0002.
module policy_circuit (
    input  wire x_verified,
    input  wire uid_claimed,
    input  wire revoked,
    output wire allow
);
    assign allow = x_verified & uid_claimed & ~revoked;
endmodule
