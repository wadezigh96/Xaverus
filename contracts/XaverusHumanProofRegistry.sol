// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title XaverusHumanProofRegistry
/// @notice On-chain record of Human Proofs: one proof hash per wallet.
/// @dev The proof hash is an opaque bytes32 commitment (keccak256 of the exact
///      binding message the wallet signed, see lib/human-proof.ts). This
///      contract never recomputes or verifies it; only the authorized server
///      writer records proofs, after verifying the X Binding and the OKX UID
///      Claim off-chain.
contract XaverusHumanProofRegistry {
    address public immutable writer;

    mapping(address => bytes32) internal proofHashes;

    event ProofRecorded(address indexed wallet, bytes32 indexed proofHash);

    error NotWriter();
    error ProofAlreadyRecorded();
    error InvalidAddress();
    error InvalidProofHash();

    constructor(address writer_) {
        if (writer_ == address(0)) revert InvalidAddress();
        writer = writer_;
    }

    /// @notice Record the Human Proof hash for a wallet.
    function recordProof(address wallet, bytes32 proofHash) external {
        if (msg.sender != writer) revert NotWriter();
        if (wallet == address(0)) revert InvalidAddress();
        if (proofHash == bytes32(0)) revert InvalidProofHash();
        if (proofHashes[wallet] != bytes32(0)) revert ProofAlreadyRecorded();
        proofHashes[wallet] = proofHash;
        emit ProofRecorded(wallet, proofHash);
    }

    /// @notice Whether the wallet has a recorded Human Proof.
    function hasProof(address wallet) external view returns (bool) {
        return proofHashes[wallet] != bytes32(0);
    }

    /// @notice The recorded proof hash for a wallet (bytes32(0) if none).
    function proofHashOf(address wallet) external view returns (bytes32) {
        return proofHashes[wallet];
    }
}
