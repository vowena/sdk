import {
  rpc as SorobanRpc,
  Keypair,
  TransactionBuilder,
  Networks,
} from "@stellar/stellar-sdk";
import { VowenaClient } from "../../src/client.js";

interface KeeperConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  keeperSecretKey: string;
  intervalMs?: number;
}

/**
 * Standalone keeper bot that charges due subscriptions.
 *
 * Usage:
 *   KEEPER_SECRET=S... CONTRACT_ID=C... RPC_URL=https://... npx ts-node keeper/src/index.ts
 */
async function main() {
  const config: KeeperConfig = {
    contractId: process.env.CONTRACT_ID ?? "",
    rpcUrl: process.env.RPC_URL ?? "https://soroban-testnet.stellar.org",
    networkPassphrase:
      process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET,
    keeperSecretKey: process.env.KEEPER_SECRET ?? "",
    intervalMs: Number(process.env.INTERVAL_MS ?? 60_000),
  };

  if (!config.contractId || !config.keeperSecretKey) {
    console.error("Missing CONTRACT_ID or KEEPER_SECRET environment variables");
    process.exit(1);
  }

  const keypair = Keypair.fromSecret(config.keeperSecretKey);
  const keeperAddress = keypair.publicKey();
  const server = new SorobanRpc.Server(config.rpcUrl);
  const client = new VowenaClient({
    contractId: config.contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
  });

  console.log(`Keeper started: ${keeperAddress}`);
  console.log(`Contract: ${config.contractId}`);
  console.log(`Polling interval: ${config.intervalMs}ms`);

  async function runCycle() {
    try {
      // Get all plans - we need a way to discover subscriptions
      // For now, try charging a range of subscription IDs
      // In production, this would use the event indexer to know which subs exist
      let subId = 1;
      let consecutiveMisses = 0;

      while (consecutiveMisses < 10) {
        try {
          const xdrStr = await client.buildCharge(keeperAddress, subId);

          // Sign the transaction
          const tx = TransactionBuilder.fromXDR(
            xdrStr,
            config.networkPassphrase
          );
          tx.sign(keypair);
          const signedXdr = tx.toXDR();

          const result = await client.submitTransaction(signedXdr);
          if (result.success) {
            console.log(`Charged sub ${subId}: ${result.hash}`);
          }
          consecutiveMisses = 0;
        } catch {
          consecutiveMisses++;
        }
        subId++;
      }
    } catch (err) {
      console.error("Keeper cycle error:", err);
    }
  }

  // Run immediately, then on interval
  await runCycle();
  setInterval(runCycle, config.intervalMs);
}

main().catch(console.error);
