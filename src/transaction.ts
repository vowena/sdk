import {
  rpc as SorobanRpc,
  TransactionBuilder,
  Transaction,
  xdr,
} from "@stellar/stellar-sdk";
import type { TransactionResult } from "./types.js";

/**
 * Build, simulate, and assemble a Soroban transaction ready for signing.
 * Returns the assembled transaction XDR (base64).
 */
export async function buildTransaction(
  server: SorobanRpc.Server,
  sourceAddress: string,
  networkPassphrase: string,
  operation: xdr.Operation
): Promise<string> {
  const account = await server.getAccount(sourceAddress);
  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(
      `Simulation failed: ${(simulated as SorobanRpc.Api.SimulateTransactionErrorResponse).error}`
    );
  }

  const assembled = SorobanRpc.assembleTransaction(
    tx,
    simulated as SorobanRpc.Api.SimulateTransactionSuccessResponse
  );
  return assembled.build().toXDR();
}

/**
 * Simulate a read-only contract call and return the result value.
 */
export async function simulateRead(
  server: SorobanRpc.Server,
  sourceAddress: string,
  networkPassphrase: string,
  operation: xdr.Operation
): Promise<xdr.ScVal | null> {
  const account = await server.getAccount(sourceAddress);
  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(
      `Simulation failed: ${(simulated as SorobanRpc.Api.SimulateTransactionErrorResponse).error}`
    );
  }

  const success = simulated as SorobanRpc.Api.SimulateTransactionSuccessResponse;
  return success.result?.retval ?? null;
}

/**
 * Submit a signed transaction and wait for confirmation.
 */
export async function submitTransaction(
  server: SorobanRpc.Server,
  signedXdr: string,
  networkPassphrase: string
): Promise<TransactionResult> {
  const tx = TransactionBuilder.fromXDR(
    signedXdr,
    networkPassphrase
  ) as Transaction;

  const response = await server.sendTransaction(tx);

  if (response.status === "ERROR") {
    return { hash: response.hash, success: false };
  }

  // Poll for result
  let getResponse = await server.getTransaction(response.hash);
  while (getResponse.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    getResponse = await server.getTransaction(response.hash);
  }

  if (getResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    return {
      hash: response.hash,
      success: true,
      returnValue: getResponse.returnValue,
    };
  }

  return { hash: response.hash, success: false };
}
