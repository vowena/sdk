export enum SubscriptionStatus {
  Active = "Active",
  Paused = "Paused",
  Cancelled = "Cancelled",
  Expired = "Expired",
}

export interface Plan {
  id: number;
  merchant: string;
  token: string;
  amount: bigint;
  period: number;
  trialPeriods: number;
  maxPeriods: number;
  gracePeriod: number;
  priceCeiling: bigint;
  createdAt: number;
  active: boolean;
  /** Display name set by the merchant when the plan was created */
  name: string;
  /** Chain-assigned ID of the parent project this plan belongs to */
  projectId: number;
}

/**
 * A Project on chain. Groups one merchant's plans under a named bucket.
 * The id is assigned by the contract (NextProjectId), so it's globally
 * unique across the protocol — no client-side ID generation anywhere.
 */
export interface Project {
  id: number;
  merchant: string;
  name: string;
  description: string;
  createdAt: number;
}

export interface CreateProjectParams {
  merchant: string;
  name: string;
  description?: string;
}

export interface Subscription {
  id: number;
  planId: number;
  subscriber: string;
  status: SubscriptionStatus;
  createdAt: number;
  periodsBilled: number;
  nextBillingTime: number;
  failedAt: number;
  migrationTarget: number;
  cancelledAt: number;
}

export interface CreatePlanParams {
  merchant: string;
  token: string;
  amount: bigint;
  period: number;
  trialPeriods?: number;
  maxPeriods?: number;
  gracePeriod?: number;
  priceCeiling: bigint;
  /** Human-readable plan name shown to merchants and subscribers */
  name: string;
  /** Chain-assigned project ID this plan belongs to */
  projectId: number;
}

export interface VowenaClientOptions {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

export interface TransactionResult {
  hash: string;
  success: boolean;
  returnValue?: unknown;
}

export interface VowenaEvent {
  type: string;
  ledger: number;
  timestamp: number;
  contractId: string;
  topics: unknown[];
  data: unknown;
}

export interface EventPollerOptions {
  contractId: string;
  rpcUrl: string;
  startLedger?: number;
  onEvent: (event: VowenaEvent) => void;
  intervalMs?: number;
}
