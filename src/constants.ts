export const NETWORKS = {
  testnet: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBENQGQPLC3CKU5HCRZPBIT6RSZVLUJKUCVPJFJGYJ3OXEW7BZCXULC2",
    usdcAddress: "CARX6UEO5WL2IMHPCFURHXNRQJQ4NHSMN26SK6FNE7FN27LISLZDINFA", // TUSDC test token
  },
  mainnet: {
    rpcUrl: "https://soroban.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    contractId: "", // Set after mainnet deployment
    usdcAddress: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI", // Mainnet USDC SAC
  },
} as const;

export const USDC_DECIMALS = 7;
export const SECONDS_PER_DAY = 86_400;
export const SECONDS_PER_MONTH = 2_592_000; // 30 days
export const SECONDS_PER_YEAR = 31_536_000; // 365 days
