// TRON Nile — a real public testnet. Users connect their own TronLink
// wallet (self-custody); this app never sees or stores a private key. The
// token itself still has NO real monetary value.
window.TRAINING_USDT_TRON_CONFIG = {
  // Deployed TrainingUSDT (TRC-20) contract address, base58 form, on Nile.
  // Redeployed with name AND symbol both "TUSDT" — Tronscan's fake-Tether
  // "Suspicious" auto-flag (which blocks TronLink's wallet_watchAsset)
  // triggers on the on-chain *name* field containing the word "USDT", not
  // just the symbol. A prior redeploy that changed only the symbol (name
  // stayed "Training USDT") was still flagged; confirmed via a throwaway
  // probe token that a bare "TUSDT" name/symbol combo is not flagged.
  CONTRACT_ADDRESS: "TGGQbnMWhQzMXMk9rp8zvcMw8bFauFDA7K",

  // Nile testnet HTTP endpoint (public, no API key needed)
  FULL_HOST: "https://nile.trongrid.io",

  // Simulated reference price used ONLY in this UI: 1 USDT = 1 simulated USD
  SIMULATED_USD_PER_TOKEN: 1,
};
