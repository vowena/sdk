import { USDC_DECIMALS } from "./constants.js";

const STROOP_FACTOR = BigInt(10 ** USDC_DECIMALS);

/**
 * Convert a human-readable amount (e.g. "9.99") to stroops (7 decimal places).
 */
export function toStroops(amount: string): bigint {
  const parts = amount.split(".");
  const whole = parts[0] ?? "0";
  let frac = parts[1] ?? "";

  if (frac.length > USDC_DECIMALS) {
    frac = frac.slice(0, USDC_DECIMALS);
  }
  frac = frac.padEnd(USDC_DECIMALS, "0");

  return BigInt(whole) * STROOP_FACTOR + BigInt(frac);
}

/**
 * Convert stroops to a human-readable string (e.g. 99900000n -> "9.99").
 */
export function fromStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;

  const whole = abs / STROOP_FACTOR;
  const frac = abs % STROOP_FACTOR;

  const fracStr = frac
    .toString()
    .padStart(USDC_DECIMALS, "0")
    .replace(/0+$/, "");
  const sign = negative ? "-" : "";

  return fracStr ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}
