// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XaverusHumanProofRegistry} from "../contracts/XaverusHumanProofRegistry.sol";
import {XaverusPassportFactory} from "../contracts/XaverusPassportFactory.sol";
import {XaverusPassport} from "../contracts/XaverusPassport.sol";

/// @notice Foundry tests for the on-chain Mint Gate: the proof registry and
///         the minting factory. No mainnet interaction; local chain only.
contract XaverusHumanProofTest is Test {
    address internal constant WRITER = address(0xBEEF);
    address internal constant WALLET = address(0xA11CE);
    bytes32 internal constant PROOF_HASH =
        0x1111111111111111111111111111111111111111111111111111111111111111;
    // Default mint policy, matching contracts/README.md and scripts/deploy-passport.mjs.
    address internal constant NATIVE_USDC = 0xB6CEceAB302E2E4948951eE7843FC24E92933061;
    uint256 internal constant PER_TX_LIMIT = 5_000_000; // 5 USDC
    uint256 internal constant DAILY_LIMIT = 25_000_000; // 25 USDC

    XaverusHumanProofRegistry internal registry;
    XaverusPassportFactory internal factory;

    function setUp() public {
        // XaverusPassport reverts unless block.chainid == 196 (X Layer mainnet).
        vm.chainId(196);
        registry = new XaverusHumanProofRegistry(WRITER);
        factory = new XaverusPassportFactory(
            address(registry), NATIVE_USDC, PER_TX_LIMIT, DAILY_LIMIT
        );
    }

    function test_recordProof_marksWalletAsProven() public {
        assertFalse(registry.hasProof(WALLET));
        assertEq(registry.proofHashOf(WALLET), bytes32(0));

        vm.prank(WRITER);
        registry.recordProof(WALLET, PROOF_HASH);

        assertTrue(registry.hasProof(WALLET));
        assertEq(registry.proofHashOf(WALLET), PROOF_HASH);
    }

    function test_recordProof_emitsProofRecorded() public {
        vm.expectEmit(true, true, false, false, address(registry));
        emit XaverusHumanProofRegistry.ProofRecorded(WALLET, PROOF_HASH);

        vm.prank(WRITER);
        registry.recordProof(WALLET, PROOF_HASH);
    }

    function test_recordProof_revertsWhenNotWriter() public {
        vm.prank(WALLET);
        vm.expectRevert(XaverusHumanProofRegistry.NotWriter.selector);
        registry.recordProof(WALLET, PROOF_HASH);
    }

    function test_recordProof_revertsOnDuplicate() public {
        vm.startPrank(WRITER);
        registry.recordProof(WALLET, PROOF_HASH);
        vm.expectRevert(XaverusHumanProofRegistry.ProofAlreadyRecorded.selector);
        registry.recordProof(WALLET, PROOF_HASH);
        vm.stopPrank();

        // The first proof is untouched.
        assertEq(registry.proofHashOf(WALLET), PROOF_HASH);
    }

    function test_constructor_revertsOnZeroWriter() public {
        vm.expectRevert(XaverusHumanProofRegistry.InvalidAddress.selector);
        new XaverusHumanProofRegistry(address(0));
    }

    function test_recordProof_revertsOnZeroWallet() public {
        vm.prank(WRITER);
        vm.expectRevert(XaverusHumanProofRegistry.InvalidAddress.selector);
        registry.recordProof(address(0), PROOF_HASH);
    }

    function test_recordProof_revertsOnZeroProofHash() public {
        vm.prank(WRITER);
        vm.expectRevert(XaverusHumanProofRegistry.InvalidProofHash.selector);
        registry.recordProof(WALLET, bytes32(0));
    }

    function test_mint_deploysPassportOwnedByMinter() public {
        vm.prank(WRITER);
        registry.recordProof(WALLET, PROOF_HASH);

        vm.prank(WALLET);
        address passport = factory.mint();

        XaverusPassport deployed = XaverusPassport(passport);
        assertEq(deployed.owner(), WALLET);
        assertEq(deployed.asset(), NATIVE_USDC);
        assertEq(deployed.perTxLimit(), PER_TX_LIMIT);
        assertEq(deployed.dailyLimit(), DAILY_LIMIT);
        assertTrue(deployed.enabled());
    }

    function test_mint_emitsPassportMinted() public {
        vm.prank(WRITER);
        registry.recordProof(WALLET, PROOF_HASH);

        // The passport is the factory's first CREATE (nonce 1).
        address expected = vm.computeCreateAddress(address(factory), 1);
        vm.expectEmit(true, true, false, false, address(factory));
        emit XaverusPassportFactory.PassportMinted(WALLET, expected);

        vm.prank(WALLET);
        factory.mint();
    }

    function test_mint_revertsWithoutProof() public {
        assertFalse(registry.hasProof(WALLET));

        vm.prank(WALLET);
        vm.expectRevert(XaverusPassportFactory.NoHumanProof.selector);
        factory.mint();
    }

    function test_factoryConstructor_revertsOnZeroRegistry() public {
        vm.expectRevert(XaverusPassportFactory.InvalidAddress.selector);
        new XaverusPassportFactory(address(0), NATIVE_USDC, PER_TX_LIMIT, DAILY_LIMIT);
    }

    function test_factoryConstructor_revertsOnZeroAsset() public {
        vm.expectRevert(XaverusPassportFactory.InvalidAddress.selector);
        new XaverusPassportFactory(address(registry), address(0), PER_TX_LIMIT, DAILY_LIMIT);
    }
}
