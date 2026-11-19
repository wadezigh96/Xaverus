# The Mint Gate lives beside the Safety Passport, not inside it

`XaverusPassport.sol` is not modified. The deployed passport is immutable, the
contract is the live policy ledger for the existing product, and changing it
would risk the features that already work. Instead the gate is built from new
pieces around it: the server mint service checks the Human Proof and returns
deploy calldata (the same shape as the existing authorize route, which returns
calldata for the wallet to sign), and two new contracts — a proof registry that
records proof hashes, and a factory that deploys a Safety Passport only for a
wallet with a recorded proof — give the official mint path an on-chain check.

This is stated honestly in the docs: the guarantee is "every passport minted
through Xaverus carries a Human Proof", not "no passport can exist without a
proof". The passport contract is open source, so anyone can still deploy it
directly; the gate governs the Xaverus mint path, and the registry is the
public record of which wallets proved themselves.

## Considered Options

- **Check the registry in the passport constructor**: rejected. It would change
  the canonical contract, break the existing deployment story, and still could
  not stop direct deployment of the old bytecode.
- **Server gate only, no contracts**: rejected as the whole story. It works, but
  the submission would have no on-chain gate to show, and the proof would live
  only on the Xaverus server.
- **Factory only, no server gate**: rejected. The server must still verify the
  X OAuth exchange and the wallet signature — work no contract can do.

## Consequences

- All existing features keep working untouched: the policy engine, the
  A2MCP safety-check, the x402 seller, the marketplace UI, and the activity
  trail. New code is additive; the only edits to existing files are wiring
  (navigation, environment example, test scripts).
- The registry writer key and the factory deployment are human steps that need
  the user's approval and mainnet funds; this build proves both contracts with
  local Foundry tests only.
