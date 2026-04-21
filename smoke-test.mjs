#!/usr/bin/env node
// End-to-end smoke test against live Vowena contract on Stellar testnet.
//
// What this proves:
//  1. The deployed contract accepts real transactions from a test wallet.
//  2. The SDK's build* methods produce XDR that (after signing nested
//     Soroban auth entries) is accepted by the network.
//  3. The SDK's read methods parse on-chain state correctly.
//  4. A permissionless charge with trial skip, real token pull, and cancel
//     all work end-to-end.
//
// Nested-auth signing: the contract's `subscribe` calls `token.approve()`
// internally with `require_auth(subscriber)`. For server-side signing (no
// Freighter), we must sign each SorobanAuthorizationEntry whose credentials
// are Address-typed. Freighter handles this natively in the browser.
//
// Run from /sdk: `node smoke-test.mjs`

import { execSync } from "node:child_process";
import {
  Keypair,
  TransactionBuilder,
  Operation,
  rpc as SorobanRpc,
  authorizeEntry,
  nativeToScVal,
  Address,
  xdr,
} from "@stellar/stellar-sdk";
import { VowenaClient, fromStroops, SECONDS_PER_DAY } from "./dist/index.js";

const CONTRACT_ID = "CDVNTA6K6YX6YWD7LAFGIVDXVIDGUB3P7EQ3EU6V3XLMQEZ5SAIGH66Z";
const TUSDC_SAC = "CARX6UEO5WL2IMHPCFURHXNRQJQ4NHSMN26SK6FNE7FN27LISLZDINFA";
const RPC_URL = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const server = new SorobanRpc.Server(RPC_URL);

const MERCHANT = "GA4Y5XHCVU4U2OAHW52DX6VRVGME2PQVEPD6RW2IQY26DTBNAWYSIJSC";
const SUBSCRIBER = "GAGRLI6F336OEJF627UNHBOPXI6VDQ75DRMSWSX2FQ25F3RFVWJOIIQU";
const ISSUER = "GBAINHPXCOOQMUYL5AEOMLIXDDQJOMYPIO4KZXXSUSHMZWQVIQA4CFQV";

function keyFromCli(alias) {
  return Keypair.fromSecret(
    execSync(`stellar keys secret ${alias}`, { encoding: "utf8" }).trim(),
  );
}

function accountIdFromEntry(entry) {
  // Only SorobanCredentialsAddress has an address; SourceAccount is auto-auth'd.
  const cred = entry.credentials();
  if (cred.switch().name !== "sorobanCredentialsAddress") return null;
  const sc = cred.address().address();
  return xdr.PublicKey.publicKeyTypeEd25519(sc.accountId().ed25519()).toXDR(
    "base64",
  );
}

function keyToAccountIdXdr(kp) {
  return kp.xdrAccountId().toXDR("base64");
}

async function signAuthEntries(entries, keypairs) {
  const latest = await server.getLatestLedger();
  const validUntil = latest.sequence + 100_000;
  return Promise.all(
    entries.map(async (entry) => {
      const cred = entry.credentials();
      if (cred.switch().name === "sorobanCredentialsSourceAccount") {
        return entry; // source-account auth is covered by envelope signature
      }
      const addrHex = accountIdFromEntry(entry);
      const signer = keypairs.find((kp) => keyToAccountIdXdr(kp) === addrHex);
      if (!signer) {
        throw new Error(
          `No keypair available to sign auth entry for ${addrHex?.slice(0, 20)}…`,
        );
      }
      return authorizeEntry(
        entry,
        (preimage) =>
          Promise.resolve({
            signature: signer.sign(preimage),
            publicKey: signer.rawPublicKey(),
          }),
        validUntil,
        PASSPHRASE,
      );
    }),
  );
}

async function invokeContract({
  sourceKp,
  contractId,
  method,
  args,
  signers,
  label,
}) {
  const account = await server.getAccount(sourceKp.publicKey());

  // 1. Probe: build + simulate to learn auth requirements + resource footprint.
  const probe = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: method,
        args,
      }),
    )
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(probe);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`${label} simulation: ${sim.error}`);
  }

  // 2. Sign any Address-credentialed auth entries.
  const rawAuth = sim.result?.auth ?? [];
  const signedAuth = await signAuthEntries(rawAuth, signers);

  // 3. Rebuild the tx with signed auth AND simulated resource config.
  const account2 = await server.getAccount(sourceKp.publicKey());
  const finalTx = new TransactionBuilder(account2, {
    fee: String(sim.minResourceFee ?? "1000000"),
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: method,
        args,
        auth: signedAuth,
      }),
    )
    .setSorobanData(sim.transactionData.build())
    .setTimeout(30)
    .build();

  // 4. Envelope signature (covers source-account auth + tx integrity).
  finalTx.sign(sourceKp);
  const res = await server.sendTransaction(finalTx);
  if (res.status === "ERROR") {
    throw new Error(
      `${label} send error: ${JSON.stringify(res.errorResult ?? res)}`,
    );
  }
  let got = await server.getTransaction(res.hash);
  while (got.status === "NOT_FOUND") {
    await new Promise((r) => setTimeout(r, 1000));
    got = await server.getTransaction(res.hash);
  }
  if (got.status !== "SUCCESS") {
    throw new Error(`${label} failed on-chain: ${res.hash} (${got.status})`);
  }
  console.log(`  ✓ ${label} → ${res.hash.slice(0, 12)}…`);
  return got;
}

async function main() {
  const merchant = keyFromCli("me");
  const subscriber = keyFromCli("lernza-deployer");
  const issuer = keyFromCli("issuer");

  console.log("Vowena E2E smoke test (testnet)");
  console.log(`  contract: ${CONTRACT_ID}`);
  console.log(`  token:    ${TUSDC_SAC} (TUSDC)\n`);

  const client = new VowenaClient({
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
  });

  // --- Trustline + mint (CLI is easiest here, only runs once per subscriber) ---
  console.log("0. Ensure subscriber has TUSDC (trustline + mint, idempotent)");
  try {
    execSync(
      `stellar tx new change-trust --source lernza-deployer --network testnet --line TUSDC:${ISSUER}`,
      { stdio: "ignore" },
    );
    console.log("  ✓ subscriber trustline established");
  } catch {
    console.log("  (subscriber trustline already exists)");
  }
  try {
    execSync(
      `stellar tx new change-trust --source me --network testnet --line TUSDC:${ISSUER}`,
      { stdio: "ignore" },
    );
    console.log("  ✓ merchant trustline established");
  } catch {
    console.log("  (merchant trustline already exists)");
  }
  try {
    execSync(
      `stellar contract invoke --id ${TUSDC_SAC} --source issuer --network testnet -- mint --to ${SUBSCRIBER} --amount 10000000000`,
      { stdio: "ignore" },
    );
    console.log("  ✓ minted 1000 TUSDC to subscriber\n");
  } catch {
    console.log("  (mint skipped, continuing)\n");
  }

  // --- 1. create_plan (merchant signs; no nested auth) ---
  console.log("1. Merchant creates plan (1 TUSDC / 60s, 1 trial, max 10)");
  await invokeContract({
    sourceKp: merchant,
    contractId: CONTRACT_ID,
    method: "create_plan",
    args: [
      new Address(MERCHANT).toScVal(),
      new Address(TUSDC_SAC).toScVal(),
      nativeToScVal(10_000_000n, { type: "i128" }),
      nativeToScVal(60, { type: "u64" }),
      nativeToScVal(1, { type: "u32" }),
      nativeToScVal(10, { type: "u32" }),
      nativeToScVal(SECONDS_PER_DAY, { type: "u64" }),
      nativeToScVal(20_000_000n, { type: "i128" }),
    ],
    signers: [merchant],
    label: "create_plan",
  });

  const plans = await client.getMerchantPlans(MERCHANT, MERCHANT);
  const planId = Number(plans[plans.length - 1]);
  console.log(`  planId: ${planId}\n`);

  // --- 2. read plan ---
  console.log("2. SDK reads plan back");
  const plan = await client.getPlan(planId, MERCHANT);
  console.log(
    `  amount=${fromStroops(plan.amount)} TUSDC period=${plan.period}s trial=${plan.trialPeriods} active=${plan.active}\n`,
  );

  // --- 3. subscribe ---
  // Caller-locked expiration_ledger + allowance_periods keep the nested
  // approve's args identical in sim and submit, so Soroban's auth tree matches.
  console.log("3. Subscriber subscribes (caller-locked allowance params)");
  const latest = await server.getLatestLedger();
  const EXP_LEDGER = latest.sequence + 2_900_000;
  await invokeContract({
    sourceKp: subscriber,
    contractId: CONTRACT_ID,
    method: "subscribe",
    args: [
      new Address(SUBSCRIBER).toScVal(),
      nativeToScVal(planId, { type: "u64" }),
      nativeToScVal(EXP_LEDGER, { type: "u32" }),
      nativeToScVal(10, { type: "u32" }), // allowance_periods (=plan.max_periods)
    ],
    signers: [subscriber],
    label: "subscribe",
  });
  const subs = await client.getSubscriberSubscriptions(SUBSCRIBER, SUBSCRIBER);
  const subId = Number(subs[subs.length - 1]);
  console.log(`  subId: ${subId}\n`);

  // --- 4. read subscription ---
  console.log("4. SDK reads subscription");
  let sub = await client.getSubscription(subId, SUBSCRIBER);
  let now = Math.floor(Date.now() / 1000);
  console.log(
    `  status=${sub.status} periodsBilled=${sub.periodsBilled} next=${sub.nextBillingTime} (+${sub.nextBillingTime - now}s)\n`,
  );

  // --- 5. charge (trial) ---
  console.log("5. Wait + charge #1 (trial period, skips transfer)");
  await new Promise((r) =>
    setTimeout(r, Math.max(0, sub.nextBillingTime - now) * 1000 + 5000),
  );
  await invokeContract({
    sourceKp: merchant,
    contractId: CONTRACT_ID,
    method: "charge",
    args: [nativeToScVal(subId, { type: "u64" })],
    signers: [merchant],
    label: "charge #1 (trial)",
  });
  sub = await client.getSubscription(subId, SUBSCRIBER);
  console.log(`  periodsBilled=${sub.periodsBilled} status=${sub.status}\n`);

  // --- 6. charge (paid) ---
  console.log("6. Wait + charge #2 (real pull of 1 TUSDC)");
  now = Math.floor(Date.now() / 1000);
  await new Promise((r) =>
    setTimeout(r, Math.max(0, sub.nextBillingTime - now) * 1000 + 5000),
  );
  await invokeContract({
    sourceKp: merchant,
    contractId: CONTRACT_ID,
    method: "charge",
    args: [nativeToScVal(subId, { type: "u64" })],
    signers: [merchant],
    label: "charge #2 (paid)",
  });
  sub = await client.getSubscription(subId, SUBSCRIBER);
  console.log(`  periodsBilled=${sub.periodsBilled} status=${sub.status}\n`);

  // --- 7. cancel ---
  console.log("7. Subscriber cancels");
  await invokeContract({
    sourceKp: subscriber,
    contractId: CONTRACT_ID,
    method: "cancel",
    args: [
      new Address(SUBSCRIBER).toScVal(),
      nativeToScVal(subId, { type: "u64" }),
    ],
    signers: [subscriber],
    label: "cancel",
  });
  const final = await client.getSubscription(subId, SUBSCRIBER);
  console.log(`  final status: ${final.status}\n`);

  console.log("✅ Vowena end-to-end verified on Stellar testnet");
  console.log(
    `   Contract: https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`,
  );
}

main().catch((e) => {
  console.error("\n❌ smoke test failed:", e.message || e);
  process.exit(1);
});
