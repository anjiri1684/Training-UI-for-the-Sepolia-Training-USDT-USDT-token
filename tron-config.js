// TRON Nile — a real public testnet. Users connect their own TronLink
// wallet (self-custody); this app never sees or stores a private key. The
// token itself still has NO real monetary value.
//
// This is a TRC-10 native asset, not a TRC-20 smart contract. TRC-10 is
// TRON's built-in token type (the same category TRX itself belongs to),
// so every TRON wallet — TronLink, Trust Wallet, anything — auto-detects
// and displays it for any address with a balance, with none of the
// "Add Custom Token" friction or wallet-side validation flakiness a
// TRC-20 contract requires. Tradeoff: TRC-10 has no approve/transferFrom
// concept at the protocol level, so that teaching exercise only exists on
// the Ethereum (Sepolia) side now.
window.TRAINING_USDT_TRON_CONFIG = {
  // TRC-10 token ID, issued directly on Nile (not a contract address).
  TOKEN_ID: "1007344",

  // Nile testnet HTTP endpoint (public, no API key needed)
  FULL_HOST: "https://nile.trongrid.io",

  // Simulated reference price used ONLY in this UI: 1 USDT = 1 simulated USD
  SIMULATED_USD_PER_TOKEN: 1,
};
