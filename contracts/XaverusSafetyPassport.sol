// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Xaverus Safety Passport
/// @notice Minimal on-chain policy/authorization registry for X Layer mainnet (chainId 196).
/// @dev This contract never holds or moves user funds. The owner wallet remains the execution boundary.
contract XaverusSafetyPassport {
    uint256 public constant CHAIN_ID = 196;

    struct Passport {
        address owner;
        uint256 perTxLimit;
        uint256 dailyLimit;
        uint256 spentToday;
        uint256 day;
        bool enabled;
    }

    uint256 private _nextPassportId = 1;
    mapping(uint256 => Passport) public passports;
    mapping(uint256 => mapping(bytes32 => bool)) public authorizedIntents;

    event PassportCreated(uint256 indexed passportId, address indexed owner);
    event PolicyUpdated(uint256 indexed passportId, uint256 perTxLimit, uint256 dailyLimit, bool enabled);
    event SpendAuthorized(uint256 indexed passportId, bytes32 indexed intentHash, uint256 amount, uint256 day);
    event SpendRecorded(uint256 indexed passportId, bytes32 indexed intentHash, uint256 amount, uint256 day);
    event PassportDisabled(uint256 indexed passportId);

    modifier onlyOwner(uint256 passportId) {
        require(passports[passportId].owner == msg.sender, "not passport owner");
        _;
    }

    constructor() {
        require(block.chainid == CHAIN_ID, "wrong chain");
    }

    function createPassport(uint256 perTxLimit, uint256 dailyLimit) external returns (uint256 passportId) {
        require(perTxLimit > 0 && dailyLimit >= perTxLimit, "invalid limits");
        passportId = _nextPassportId++;
        passports[passportId] = Passport(msg.sender, perTxLimit, dailyLimit, 0, _day(), true);
        emit PassportCreated(passportId, msg.sender);
        emit PolicyUpdated(passportId, perTxLimit, dailyLimit, true);
    }

    function setPolicy(uint256 passportId, uint256 perTxLimit, uint256 dailyLimit, bool enabled)
        external onlyOwner(passportId)
    {
        require(perTxLimit > 0 && dailyLimit >= perTxLimit, "invalid limits");
        Passport storage p = passports[passportId];
        _rollDay(p);
        p.perTxLimit = perTxLimit;
        p.dailyLimit = dailyLimit;
        p.enabled = enabled;
        emit PolicyUpdated(passportId, perTxLimit, dailyLimit, enabled);
        if (!enabled) emit PassportDisabled(passportId);
    }

    function authorizeSpend(uint256 passportId, bytes32 intentHash, uint256 amount)
        external onlyOwner(passportId) returns (bool)
    {
        Passport storage p = passports[passportId];
        require(p.enabled, "passport disabled");
        require(amount > 0 && amount <= p.perTxLimit, "per-tx limit");
        _rollDay(p);
        require(p.spentToday + amount <= p.dailyLimit, "daily limit");
        require(!authorizedIntents[passportId][intentHash], "intent already authorized");
        authorizedIntents[passportId][intentHash] = true;
        p.spentToday += amount;
        emit SpendAuthorized(passportId, intentHash, amount, p.day);
        return true;
    }

    function recordSpend(uint256 passportId, bytes32 intentHash, uint256 amount)
        external onlyOwner(passportId)
    {
        require(authorizedIntents[passportId][intentHash], "not authorized");
        emit SpendRecorded(passportId, intentHash, amount, _day());
    }

    function _rollDay(Passport storage p) internal {
        uint256 today = _day();
        if (p.day != today) {
            p.day = today;
            p.spentToday = 0;
        }
    }

    function _day() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }
}
