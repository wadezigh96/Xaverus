// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XaverusHumanProofRegistry} from "./XaverusHumanProofRegistry.sol";
import {XaverusPassport} from "./XaverusPassport.sol";

/// @title XaverusPassportFactory
/// @notice Mints a Safety Passport only for a wallet with a recorded Human Proof.
/// @dev The Mint Gate lives beside the passport contract, not inside it
///      (ADR-0003): XaverusPassport is untouched, and this factory is the
///      official mint path. The deployed passport's owner is the minter.
///      Default mint policy (see contracts/README.md): native USDC asset,
///      5 USDC per transaction, 25 USDC per day.
contract XaverusPassportFactory {
    XaverusHumanProofRegistry public immutable registry;
    address public immutable asset;
    uint256 public immutable perTxLimit;
    uint256 public immutable dailyLimit;

    event PassportMinted(address indexed minter, address indexed passport);

    error NoHumanProof();
    error InvalidAddress();

    constructor(
        address registry_,
        address asset_,
        uint256 perTxLimit_,
        uint256 dailyLimit_
    ) {
        if (registry_ == address(0)) revert InvalidAddress();
        if (asset_ == address(0)) revert InvalidAddress();
        registry = XaverusHumanProofRegistry(registry_);
        asset = asset_;
        perTxLimit = perTxLimit_;
        dailyLimit = dailyLimit_;
    }

    /// @notice Mint a Safety Passport for the caller.
    /// @return passport The address of the newly deployed passport.
    function mint() external returns (address passport) {
        if (!registry.hasProof(msg.sender)) revert NoHumanProof();
        XaverusPassport passport_ = new XaverusPassport(asset, perTxLimit, dailyLimit);
        // The factory is the passport's owner at deploy time; hand ownership
        // to the minter atomically in the same call.
        passport_.transferOwnership(msg.sender);
        emit PassportMinted(msg.sender, address(passport_));
        return address(passport_);
    }
}
