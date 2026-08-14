// TRON Nile — a real public testnet. Users connect their own TronLink
// wallet (self-custody); this app never sees or stores a private key. The
// token itself still has NO real monetary value.
window.TRAINING_USDT_TRON_CONFIG = {
  // Deployed TrainingUSDT (TRC-20) contract address, base58 form, on Nile
  CONTRACT_ADDRESS: "TYBogwDq6jsz1jfJ9Fc99vAxhTz68mJtgv",

  // Nile testnet HTTP endpoint (public, no API key needed)
  FULL_HOST: "https://nile.trongrid.io",

  // Simulated reference price used ONLY in this UI: 1 USDT = 1 simulated USD
  SIMULATED_USD_PER_TOKEN: 1,
};
