import { rpc as SorobanRpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { VowenaEvent, EventPollerOptions } from "./types.js";

function parseEvent(
  raw: SorobanRpc.Api.EventResponse
): VowenaEvent {
  const topics = raw.topic.map((t) => {
    try {
      if (typeof t === "string") {
        return scValToNative(xdr.ScVal.fromXDR(t, "base64"));
      }
      return scValToNative(t as xdr.ScVal);
    } catch {
      return t;
    }
  });

  let data: unknown;
  try {
    if (typeof raw.value === "string") {
      data = scValToNative(xdr.ScVal.fromXDR(raw.value, "base64"));
    } else {
      data = scValToNative(raw.value as xdr.ScVal);
    }
  } catch {
    data = raw.value;
  }

  return {
    type: typeof topics[0] === "string" ? topics[0] : "unknown",
    ledger: raw.ledger,
    timestamp: 0,
    contractId: String(raw.contractId ?? ""),
    topics,
    data,
  };
}

/**
 * Fetch contract events from Soroban RPC.
 */
export async function getEvents(
  rpcUrl: string,
  contractId: string,
  startLedger: number,
  limit = 100
): Promise<{ events: VowenaEvent[]; latestLedger: number }> {
  const server = new SorobanRpc.Server(rpcUrl);
  const response = await server.getEvents({
    startLedger,
    filters: [
      {
        type: "contract",
        contractIds: [contractId],
      },
    ],
    limit,
  });

  const events = response.events.map(parseEvent);
  return { events, latestLedger: response.latestLedger };
}

/**
 * Poll for new events at a regular interval.
 */
export class VowenaEventPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastLedger: number;
  private options: EventPollerOptions;

  constructor(options: EventPollerOptions) {
    this.options = options;
    this.lastLedger = options.startLedger ?? 0;
  }

  async start(): Promise<void> {
    if (this.lastLedger === 0) {
      const server = new SorobanRpc.Server(this.options.rpcUrl);
      const health = await server.getHealth();
      this.lastLedger = health.latestLedger;
    }

    const poll = async () => {
      try {
        const { events, latestLedger } = await getEvents(
          this.options.rpcUrl,
          this.options.contractId,
          this.lastLedger
        );

        for (const event of events) {
          this.options.onEvent(event);
        }

        if (latestLedger > this.lastLedger) {
          this.lastLedger = latestLedger;
        }
      } catch {
        // Silently retry on next poll
      }
    };

    await poll();
    this.timer = setInterval(poll, this.options.intervalMs ?? 5000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
