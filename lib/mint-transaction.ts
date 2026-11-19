import {encodeFunctionData, getAddress, type Address, type Hex} from "viem";

/**
 * Mint calldata for the Safety Passport factory. The Mint Gate returns this
 * calldata for the wallet to sign, the same shape as the existing authorize
 * route (ADR-0003). The factory contract itself is built by ticket 04; this
 * ABI is the agreed interface and must not change without the coordinator.
 */

export const X_LAYER_CHAIN_ID = 196;

/** Factory ABI, exactly: mint() external returns (address passport). */
export const MINT_FACTORY_ABI = [
  {
    type: "function",
    name: "mint",
    inputs: [],
    outputs: [{name: "passport", type: "address"}],
    stateMutability: "nonpayable",
  },
] as const;

export type MintTransaction = {
  to: Address;
  data: Hex;
  value: "0x0";
  chainId: typeof X_LAYER_CHAIN_ID;
};

/** Calldata for factory mint(). Validates the factory address; pure. */
export function buildMintCalldata(factoryAddress: string): Hex {
  getAddress(factoryAddress);
  return encodeFunctionData({abi: MINT_FACTORY_ABI, functionName: "mint"});
}

/** The full transaction the minting wallet signs: factory, calldata, no value. */
export function buildMintTransaction(factoryAddress: string): MintTransaction {
  const factory = getAddress(factoryAddress);
  return {
    to: factory,
    data: buildMintCalldata(factory),
    value: "0x0",
    chainId: X_LAYER_CHAIN_ID,
  };
}
