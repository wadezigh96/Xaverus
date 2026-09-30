// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title XaverusPassport
/// @notice Minimal on-chain Safety Passport for X Layer mainnet.
/// @dev The owner wallet is the approval authority. The contract records and enforces
///      spend policy on-chain; it never stores keys and never executes token transfers.
contract XaverusPassport {
    uint256 public constant TOKEN_DECIMALS = 6;
    uint256 public constant CHAIN_ID = 196;

    address public owner;
    address public immutable asset;
    uint256 public perTxLimit;
    uint256 public dailyLimit;
    bool public enabled;
    bool public allowlistEnabled;

    mapping(address => bool) public recipientAllowed;
    mapping(uint256 => uint256) public spentByDay;
    mapping(bytes32 => bool) public authorizationUsed;

    event AuthorizationRecorded(
        bytes32 indexed requestId,
        address indexed owner,
        address indexed recipient,
        uint256 amount,
        uint256 day,
        uint256 spentToday
    );
    event PolicyUpdated(uint256 perTxLimit, uint256 dailyLimit, bool enabled);
    event RecipientUpdated(address indexed recipient, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error InvalidAddress();
    error Disabled();
    error InvalidAmount();
    error PerTxLimitExceeded();
    error DailyLimitExceeded();
    error WrongAsset();
    error RecipientNotAllowed();
    error RequestAlreadyUsed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address asset_,
        uint256 perTxLimit_,
        uint256 dailyLimit_
    ) {
        if (asset_ == address(0)) revert InvalidAddress();
        owner = msg.sender;
        asset = asset_;
        perTxLimit = perTxLimit_;
        dailyLimit = dailyLimit_;
        enabled = true;
        emit PolicyUpdated(perTxLimit_, dailyLimit_, true);
    }

    /// @notice Records an approved payment intent and atomically consumes its daily budget.
    /// @dev Amounts use the configured token's smallest units; Xaverus defaults to 6 decimals.
    function authorize(
        bytes32 requestId,
        uint256 amount,
        address token,
        address recipient
    ) external onlyOwner {
        if (!enabled) revert Disabled();
        if (requestId == bytes32(0)) revert InvalidAmount();
        if (amount == 0) revert InvalidAmount();
        if (token != asset) revert WrongAsset();
        if (amount > perTxLimit) revert PerTxLimitExceeded();

        uint256 day = block.timestamp / 1 days;
        uint256 nextSpent = spentByDay[day] + amount;
        if (nextSpent > dailyLimit) revert DailyLimitExceeded();

        if (allowlistEnabled && !recipientAllowed[recipient]) {
            revert RecipientNotAllowed();
        }
        if (authorizationUsed[requestId]) revert RequestAlreadyUsed();

        authorizationUsed[requestId] = true;
        spentByDay[day] = nextSpent;

        emit AuthorizationRecorded(
            requestId,
            msg.sender,
            recipient,
            amount,
            day,
            nextSpent
        );
    }

    function setPolicy(
        uint256 perTxLimit_,
        uint256 dailyLimit_,
        bool enabled_
    ) external onlyOwner {
        perTxLimit = perTxLimit_;
        dailyLimit = dailyLimit_;
        enabled = enabled_;
        emit PolicyUpdated(perTxLimit_, dailyLimit_, enabled_);
    }

    function setRecipient(address recipient, bool allowed) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        recipientAllowed[recipient] = allowed;
        emit RecipientUpdated(recipient, allowed);
    }

    function setAllowlistEnabled(bool enabled_) external onlyOwner {
        allowlistEnabled = enabled_;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function spentToday() external view returns (uint256) {
        return spentByDay[block.timestamp / 1 days];
    }

    function remainingToday() external view returns (uint256) {
        uint256 spent = spentByDay[block.timestamp / 1 days];
        if (spent >= dailyLimit) return 0;
        return dailyLimit - spent;
    }
}
