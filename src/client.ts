import {
  rpc as SorobanRpc,
  Contract,
  Address,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import type {
  VowenaClientOptions,
  CreatePlanParams,
  CreateProjectParams,
  Plan,
  Project,
  Subscription,
  SubscriptionStatus,
  TransactionResult,
} from "./types.js";
import {
  buildTransaction,
  simulateRead,
  submitTransaction,
} from "./transaction.js";

/**
 * Client for interacting with the Vowena recurring payment protocol.
 */
export class VowenaClient {
  private server: SorobanRpc.Server;
  private contract: Contract;
  private networkPassphrase: string;
  public contractId: string;

  constructor(options: VowenaClientOptions) {
    this.server = new SorobanRpc.Server(options.rpcUrl);
    this.contract = new Contract(options.contractId);
    this.networkPassphrase = options.networkPassphrase;
    this.contractId = options.contractId;
  }

  // ---- Write methods (return assembled XDR for wallet signing) ----

  /**
   * Build a tx that creates a Project on chain. Returns the assembled XDR
   * for the merchant's wallet to sign. The contract assigns the project_id
   * (a globally unique u64) on submit; read it via getMerchantProjects()
   * after the tx confirms.
   */
  async buildCreateProject(params: CreateProjectParams): Promise<string> {
    const op = this.contract.call(
      "create_project",
      new Address(params.merchant).toScVal(),
      nativeToScVal(params.name, { type: "string" }),
      nativeToScVal(params.description ?? "", { type: "string" }),
    );
    return buildTransaction(
      this.server,
      params.merchant,
      this.networkPassphrase,
      op,
    );
  }

  async buildCreatePlan(params: CreatePlanParams): Promise<string> {
    const op = this.contract.call(
      "create_plan",
      new Address(params.merchant).toScVal(),
      new Address(params.token).toScVal(),
      nativeToScVal(params.amount, { type: "i128" }),
      nativeToScVal(params.period, { type: "u64" }),
      nativeToScVal(params.trialPeriods ?? 0, { type: "u32" }),
      nativeToScVal(params.maxPeriods ?? 0, { type: "u32" }),
      nativeToScVal(params.gracePeriod ?? 2_592_000, { type: "u64" }),
      nativeToScVal(params.priceCeiling, { type: "i128" }),
      nativeToScVal(params.name, { type: "string" }),
      nativeToScVal(params.projectId, { type: "u64" }),
    );
    return buildTransaction(
      this.server,
      params.merchant,
      this.networkPassphrase,
      op,
    );
  }

  /**
   * Build a subscribe tx. The contract sets a SAC allowance on behalf of the
   * subscriber during this call; those values must be locked in at build time
   * (not computed inside the contract) so Soroban's auth tree matches between
   * transaction simulation and submission.
   *
   * If you omit `expirationLedger` or `allowancePeriods`, the SDK picks safe
   * defaults: current RPC ledger + MAX_APPROVAL_LEDGERS, and 120 periods.
   */
  async buildSubscribe(
    subscriber: string,
    planId: number,
    opts: { expirationLedger?: number; allowancePeriods?: number } = {},
  ): Promise<string> {
    const expirationLedger =
      opts.expirationLedger ?? (await this.defaultExpirationLedger());
    const allowancePeriods = opts.allowancePeriods ?? 120;

    const op = this.contract.call(
      "subscribe",
      new Address(subscriber).toScVal(),
      nativeToScVal(planId, { type: "u64" }),
      nativeToScVal(expirationLedger, { type: "u32" }),
      nativeToScVal(allowancePeriods, { type: "u32" }),
    );
    return buildTransaction(
      this.server,
      subscriber,
      this.networkPassphrase,
      op,
    );
  }

  private async defaultExpirationLedger(): Promise<number> {
    const latest = await this.server.getLatestLedger();
    // Cap below the SAC's live_until max (3,110,400). 2,900,000 is a safe
    // ~168-day buffer that avoids edge-case rejections.
    return latest.sequence + 2_900_000;
  }

  async buildCharge(callerAddress: string, subId: number): Promise<string> {
    const op = this.contract.call(
      "charge",
      nativeToScVal(subId, { type: "u64" }),
    );
    return buildTransaction(
      this.server,
      callerAddress,
      this.networkPassphrase,
      op,
    );
  }

  async buildCancel(caller: string, subId: number): Promise<string> {
    const op = this.contract.call(
      "cancel",
      new Address(caller).toScVal(),
      nativeToScVal(subId, { type: "u64" }),
    );
    return buildTransaction(this.server, caller, this.networkPassphrase, op);
  }

  async buildRefund(
    merchantAddress: string,
    subId: number,
    amount: bigint,
  ): Promise<string> {
    const op = this.contract.call(
      "refund",
      nativeToScVal(subId, { type: "u64" }),
      nativeToScVal(amount, { type: "i128" }),
    );
    return buildTransaction(
      this.server,
      merchantAddress,
      this.networkPassphrase,
      op,
    );
  }

  async buildUpdatePlanAmount(
    merchantAddress: string,
    planId: number,
    newAmount: bigint,
  ): Promise<string> {
    const op = this.contract.call(
      "update_plan_amount",
      nativeToScVal(planId, { type: "u64" }),
      nativeToScVal(newAmount, { type: "i128" }),
    );
    return buildTransaction(
      this.server,
      merchantAddress,
      this.networkPassphrase,
      op,
    );
  }

  async buildRequestMigration(
    merchant: string,
    oldPlanId: number,
    newPlanId: number,
  ): Promise<string> {
    const op = this.contract.call(
      "request_migration",
      new Address(merchant).toScVal(),
      nativeToScVal(oldPlanId, { type: "u64" }),
      nativeToScVal(newPlanId, { type: "u64" }),
    );
    return buildTransaction(this.server, merchant, this.networkPassphrase, op);
  }

  async buildAcceptMigration(
    subscriber: string,
    subId: number,
    opts: { expirationLedger?: number; allowancePeriods?: number } = {},
  ): Promise<string> {
    const expirationLedger =
      opts.expirationLedger ?? (await this.defaultExpirationLedger());
    const allowancePeriods = opts.allowancePeriods ?? 120;

    const op = this.contract.call(
      "accept_migration",
      new Address(subscriber).toScVal(),
      nativeToScVal(subId, { type: "u64" }),
      nativeToScVal(expirationLedger, { type: "u32" }),
      nativeToScVal(allowancePeriods, { type: "u32" }),
    );
    return buildTransaction(
      this.server,
      subscriber,
      this.networkPassphrase,
      op,
    );
  }

  async buildRejectMigration(
    subscriber: string,
    subId: number,
  ): Promise<string> {
    const op = this.contract.call(
      "reject_migration",
      new Address(subscriber).toScVal(),
      nativeToScVal(subId, { type: "u64" }),
    );
    return buildTransaction(
      this.server,
      subscriber,
      this.networkPassphrase,
      op,
    );
  }

  async buildReactivate(
    subscriber: string,
    subId: number,
    opts: { expirationLedger?: number; allowancePeriods?: number } = {},
  ): Promise<string> {
    const expirationLedger =
      opts.expirationLedger ?? (await this.defaultExpirationLedger());
    const allowancePeriods = opts.allowancePeriods ?? 120;

    const op = this.contract.call(
      "reactivate",
      new Address(subscriber).toScVal(),
      nativeToScVal(subId, { type: "u64" }),
      nativeToScVal(expirationLedger, { type: "u32" }),
      nativeToScVal(allowancePeriods, { type: "u32" }),
    );
    return buildTransaction(
      this.server,
      subscriber,
      this.networkPassphrase,
      op,
    );
  }

  /**
   * Bump the TTL of a plan + subscription entry. Permissionless: anyone can
   * call. Useful for keepers that want to keep long-lived state alive
   * alongside their charge() calls.
   */
  async buildExtendTtl(
    callerAddress: string,
    planId: number,
    subId: number,
  ): Promise<string> {
    const op = this.contract.call(
      "extend_ttl",
      nativeToScVal(planId, { type: "u64" }),
      nativeToScVal(subId, { type: "u64" }),
    );
    return buildTransaction(
      this.server,
      callerAddress,
      this.networkPassphrase,
      op,
    );
  }

  // ---- Read methods ----

  private async readContract(
    callerAddress: string,
    method: string,
    ...args: Parameters<Contract["call"]> extends [string, ...infer R]
      ? R
      : never
  ): Promise<unknown> {
    const op = this.contract.call(method, ...args);
    const result = await simulateRead(
      this.server,
      callerAddress,
      this.networkPassphrase,
      op,
    );
    return result ? scValToNative(result) : null;
  }

  async getPlan(planId: number, callerAddress: string): Promise<Plan> {
    const raw = (await this.readContract(
      callerAddress,
      "get_plan",
      nativeToScVal(planId, { type: "u64" }),
    )) as Record<string, unknown>;
    return parsePlan(raw);
  }

  async getSubscription(
    subId: number,
    callerAddress: string,
  ): Promise<Subscription> {
    const raw = (await this.readContract(
      callerAddress,
      "get_subscription",
      nativeToScVal(subId, { type: "u64" }),
    )) as Record<string, unknown>;
    return parseSubscription(raw);
  }

  async getMerchantPlans(
    merchant: string,
    callerAddress: string,
  ): Promise<number[]> {
    const raw = await this.readContract(
      callerAddress,
      "get_merchant_plans",
      new Address(merchant).toScVal(),
    );
    return (raw as number[]) ?? [];
  }

  async getProject(projectId: number, callerAddress: string): Promise<Project> {
    const raw = (await this.readContract(
      callerAddress,
      "get_project",
      nativeToScVal(projectId, { type: "u64" }),
    )) as Record<string, unknown>;
    return parseProject(raw);
  }

  async getMerchantProjects(
    merchant: string,
    callerAddress: string,
  ): Promise<number[]> {
    const raw = await this.readContract(
      callerAddress,
      "get_merchant_projects",
      new Address(merchant).toScVal(),
    );
    return (raw as number[]) ?? [];
  }

  async getSubscriberSubscriptions(
    subscriber: string,
    callerAddress: string,
  ): Promise<number[]> {
    const raw = await this.readContract(
      callerAddress,
      "get_subscriber_subscriptions",
      new Address(subscriber).toScVal(),
    );
    return (raw as number[]) ?? [];
  }

  async getPlanSubscribers(
    planId: number,
    callerAddress: string,
  ): Promise<number[]> {
    const raw = await this.readContract(
      callerAddress,
      "get_plan_subscribers",
      nativeToScVal(planId, { type: "u64" }),
    );
    return (raw as number[]) ?? [];
  }

  // ---- Submit ----

  async submitTransaction(signedXdr: string): Promise<TransactionResult> {
    return submitTransaction(this.server, signedXdr, this.networkPassphrase);
  }
}

// ---- Parsers ----

function parsePlan(raw: Record<string, unknown>): Plan {
  return {
    id: Number(raw.id),
    merchant: String(raw.merchant),
    token: String(raw.token),
    amount: BigInt(raw.amount as string | number),
    period: Number(raw.period),
    trialPeriods: Number(raw.trial_periods),
    maxPeriods: Number(raw.max_periods),
    gracePeriod: Number(raw.grace_period),
    priceCeiling: BigInt(raw.price_ceiling as string | number),
    createdAt: Number(raw.created_at),
    active: Boolean(raw.active),
    name: raw.name != null ? String(raw.name) : "",
    projectId: Number(raw.project_id ?? 0),
  };
}

function parseProject(raw: Record<string, unknown>): Project {
  return {
    id: Number(raw.id),
    merchant: String(raw.merchant),
    name: raw.name != null ? String(raw.name) : "",
    description: raw.description != null ? String(raw.description) : "",
    createdAt: Number(raw.created_at),
  };
}

function parseSubscription(raw: Record<string, unknown>): Subscription {
  const statusMap: Record<string, SubscriptionStatus> = {
    Active: "Active" as SubscriptionStatus,
    Paused: "Paused" as SubscriptionStatus,
    Cancelled: "Cancelled" as SubscriptionStatus,
    Expired: "Expired" as SubscriptionStatus,
  };

  return {
    id: Number(raw.id),
    planId: Number(raw.plan_id),
    subscriber: String(raw.subscriber),
    status: statusMap[String(raw.status)] ?? ("Active" as SubscriptionStatus),
    createdAt: Number(raw.created_at),
    periodsBilled: Number(raw.periods_billed),
    nextBillingTime: Number(raw.next_billing_time),
    failedAt: Number(raw.failed_at),
    migrationTarget: Number(raw.migration_target),
    cancelledAt: Number(raw.cancelled_at),
  };
}
