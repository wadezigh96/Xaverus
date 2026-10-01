// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title XaverusPassport
/// @notice Minimal on-chain Safety Passport for X Layer mainnet (chain ID 196).
/// @dev Owner wallet is the approval authority. This contract records and enforces
///      spend policy on-chain; it never stores keys and never transfers tokens.
/// @custom:security-contact xaverus
contract XaverusPassport {
    /// @notice Token decimals assumed by the Xaverus UI (native USDC = 6).
    uint256 public constant TOKEN_DECIMALS = 6;
    /// @notice Target chain ID (X Layer mainnet).
    uint256 public constant CHAIN_ID = 196;
    /// @notice Circle native USDC on X Layer mainnet.
    address public constant NATIVE_USDC = 0xB6CEceAB302E2E4948951eE7843FC24e92933061;

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
    event AllowlistToggled(bool enabled);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error InvalidAddress();
    error InvalidLimits();
    error Disabled();
    error InvalidAmount();
    error InvalidRequestId();
    error PerTxLimitExceeded();
    error DailyLimitExceeded();
    error WrongAsset();
    error RecipientNotAllowed();
    error RequestAlreadyUsed();
    error WrongChain();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param asset_ ERC-20 asset this passport governs (use NATIVE_USDC on mainnet).
    /// @param perTxLimit_ Max amount per authorization (token smallest units).
    /// @param dailyLimit_ Max cumulative amount per UTC day (token smallest units).
    constructor(address asset_, uint256 perTxLimit_, uint256 dailyLimit_) {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (asset_ == address(0)) revert InvalidAddress();
        if (perTxLimit_ == 0 || dailyLimit_ < perTxLimit_) revert InvalidLimits();

        owner = msg.sender;
        asset = asset_;
        perTxLimit = perTxLimit_;
        dailyLimit = dailyLimit_;
        enabled = true;

        emit PolicyUpdated(perTxLimit_, dailyLimit_, true);
    }

    /// @notice Records an approved payment intent and atomically consumes daily budget.
    /// @dev Amounts are in the asset's smallest units. Does not transfer tokens.
    function authorize(
        bytes32 requestId,
        uint256 amount,
        address token,
        address recipient
    ) external onlyOwner {
        if (!enabled) revert Disabled();
        if (requestId == bytes32(0)) revert InvalidRequestId();
        if (amount == 0) revert InvalidAmount();
        if (recipient == address(0)) revert InvalidAddress();
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

    /// @notice Update spend limits and kill-switch flag.
    function setPolicy(
        uint256 perTxLimit_,
        uint256 dailyLimit_,
        bool enabled_
    ) external onlyOwner {
        if (perTxLimit_ == 0 || dailyLimit_ < perTxLimit_) revert InvalidLimits();
        perTxLimit = perTxLimit_;
        dailyLimit = dailyLimit_;
        enabled = enabled_;
        emit PolicyUpdated(perTxLimit_, dailyLimit_, enabled_);
    }

    /// @notice Convenience kill switch (sets enabled = false, keeps limits).
    function killSwitch() external onlyOwner {
        enabled = false;
        emit PolicyUpdated(perTxLimit, dailyLimit, false);
    }

    /// @notice Allow or deny a recipient when the allowlist is enabled.
    function setRecipient(address recipient, bool allowed) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        recipientAllowed[recipient] = allowed;
        emit RecipientUpdated(recipient, allowed);
    }

    /// @notice Toggle recipient allowlist enforcement.
    function setAllowlistEnabled(bool enabled_) external onlyOwner {
        allowlistEnabled = enabled_;
        emit AllowlistToggled(enabled_);
    }

    /// @notice Transfer passport ownership (approval authority).
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    /// @notice Whether a request ID has already been authorized.
    function isAuthorized(bytes32 requestId) external view returns (bool) {
        return authorizationUsed[requestId];
    }

    /// @notice Spend recorded for the current UTC day.
    function spentToday() external view returns (uint256) {
        return spentByDay[block.timestamp / 1 days];
    }

    /// @notice Remaining daily budget for the current UTC day.
    function remainingToday() external view returns (uint256) {
        uint256 spent = spentByDay[block.timestamp / 1 days];
        if (spent >= dailyLimit) return 0;
        return dailyLimit - spent;
    }

    /// @notice Current UTC day index used for the spend ledger.
    function currentDay() external view returns (uint256) {
        return block.timestamp / 1 days;
    }
}
