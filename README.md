# vowena

TypeScript SDK for the Vowena recurring payment protocol on Stellar. Build, simulate, and submit subscription transactions against the Vowena smart contract on Soroban.

[![npm version](https://img.shields.io/npm/v/vowena)](https://www.npmjs.com/package/vowena)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![CI](https://github.com/vowena/sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/vowena/sdk/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

## Install

```bash
npm install @vowena/sdk
```

## Quick start

```typescript
import { VowenaClient } from "@vowena/sdk";

const client = new VowenaClient({
  contractId: "C...",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
});

// Read a plan
const plan = await client.getPlan(1, callerAddress);

// Build a subscribe transaction (returns XDR for wallet signing)
const tx = await client.buildSubscribe(subscriberAddress, planId);
```

Every `build*` method returns an assembled Soroban transaction as base64 XDR. Pass it to the user's wallet for signing, then submit:

```typescript
const result = await client.submitTransaction(signedXdr);
console.log(result.hash, result.success);
```

## API

### Write methods

These return assembled transaction XDR (base64 string) ready for wallet signing.

| Method                                                  | Description                                    |
| ------------------------------------------------------- | ---------------------------------------------- |
| `buildCreatePlan(params)`                               | Create a new subscription plan                 |
| `buildSubscribe(subscriber, planId)`                    | Subscribe to a plan                            |
| `buildCharge(caller, subId)`                            | Charge a subscription for the current period   |
| `buildCancel(caller, subId)`                            | Cancel a subscription                          |
| `buildRefund(merchant, subId, amount)`                  | Refund a subscriber                            |
| `buildUpdatePlanAmount(merchant, planId, newAmount)`    | Update a plan's recurring amount               |
| `buildRequestMigration(merchant, oldPlanId, newPlanId)` | Request migration of subscribers to a new plan |
| `buildAcceptMigration(subscriber, subId)`               | Accept a pending migration                     |
| `buildRejectMigration(subscriber, subId)`               | Reject a pending migration                     |
| `buildReactivate(subscriber, subId)`                    | Reactivate a cancelled subscription            |

### Read methods

These simulate the contract call and return parsed data directly.

| Method                                           | Description                            |
| ------------------------------------------------ | -------------------------------------- |
| `getPlan(planId, caller)`                        | Fetch a plan by ID                     |
| `getSubscription(subId, caller)`                 | Fetch a subscription by ID             |
| `getMerchantPlans(merchant, caller)`             | List plan IDs for a merchant           |
| `getSubscriberSubscriptions(subscriber, caller)` | List subscription IDs for a subscriber |
| `getPlanSubscribers(planId, caller)`             | List subscription IDs for a plan       |

### Submit

| Method                         | Description                                           |
| ------------------------------ | ----------------------------------------------------- |
| `submitTransaction(signedXdr)` | Submit a signed transaction and wait for confirmation |

## Amount conversion

Amounts on the contract use stroops (7 decimal places). Use the included conversion utilities:

```typescript
import { toStroops, fromStroops } from "@vowena/sdk";

const amount = toStroops("9.99"); // 99900000n
const display = fromStroops(99900000n); // "9.99"
```

## Events

Poll for contract events using `getEvents` or the `VowenaEventPoller` class:

```typescript
import { getEvents, VowenaEventPoller } from "@vowena/sdk";

// One-shot fetch
const { events, latestLedger } = await getEvents(
  rpcUrl,
  contractId,
  startLedger,
);

// Continuous polling
const poller = new VowenaEventPoller({
  contractId: "C...",
  rpcUrl: "https://soroban-testnet.stellar.org",
  onEvent: (event) => console.log(event.type, event.data),
  intervalMs: 5000,
});

await poller.start();
// later: poller.stop();
```

## Constants

The SDK exports pre-configured network settings and time constants:

```typescript
import {
  NETWORKS,
  USDC_DECIMALS,
  SECONDS_PER_DAY,
  SECONDS_PER_MONTH,
  SECONDS_PER_YEAR,
} from "@vowena/sdk";

console.log(NETWORKS.testnet.rpcUrl); // "https://soroban-testnet.stellar.org"
```

## Keeper bot

The `keeper/` directory contains a standalone billing automation bot that charges subscriptions on schedule. See [`keeper/`](./keeper/) for details.

## Links

- [Documentation](https://docs.vowena.xyz)
- [Protocol (smart contract)](https://github.com/vowena/protocol)
- [Dashboard](https://github.com/vowena/dashboard)

## Contributing

Contributions are welcome. Please read the [contributing guide](./CONTRIBUTING.md) before opening a pull request.

## License

[Apache 2.0](./LICENSE)
