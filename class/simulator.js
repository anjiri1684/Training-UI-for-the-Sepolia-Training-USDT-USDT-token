/**
 * Practice Simulator — a self-contained paper-trading game. Entirely
 * fake: fake starting balance, fake price ticks (a random walk), fake
 * positions. Persisted only in this browser's localStorage. Has NO
 * connection to ClassChain Token, your real balance, or any real account
 * — labeled as practice everywhere it appears.
 *
 * The DOM is built once (buildSimulator) and price ticks only patch text
 * content afterward (tickSimulatorPrices) — never re-rendering the whole
 * card, so typing into the Amount field never gets wiped out mid-tick.
 */
const SIM_ASSETS = [
  { key: "btc", label: "Bitcoin (practice)", price: 60000 },
  { key: "eth", label: "Ethereum (practice)", price: 3000 },
  { key: "bnb", label: "BNB (practice)", price: 570 },
  { key: "sol", label: "Solana (practice)", price: 140 },
  { key: "xrp", label: "XRP (practice)", price: 0.55 },
  { key: "doge", label: "Dogecoin (practice)", price: 0.12 },
];
const SIM_START_BALANCE = 10000;

function simState() {
  const raw = localStorage.getItem("cc_sim_state");
  if (raw) return JSON.parse(raw);
  const fresh = {
    cash: SIM_START_BALANCE,
    prices: Object.fromEntries(SIM_ASSETS.map((a) => [a.key, a.price])),
    holdings: Object.fromEntries(SIM_ASSETS.map((a) => [a.key, 0])),
  };
  localStorage.setItem("cc_sim_state", JSON.stringify(fresh));
  return fresh;
}
function simSave(state) {
  localStorage.setItem("cc_sim_state", JSON.stringify(state));
}
function simReset() {
  localStorage.removeItem("cc_sim_state");
  buildSimulator();
}

function money(n) {
  const decimals = Math.abs(n) > 0 && Math.abs(n) < 1 ? 4 : 2;
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// The Amount field is a dollar amount to spend/receive, not a raw asset
// quantity — typing "2000" means "$2000 worth", which is what a beginner
// expects. It's converted to/from asset quantity using the current
// practice price.
function simTrade(assetKey, side) {
  const state = simState();
  const amountInput = document.getElementById(`sim-amt-${assetKey}`);
  const dollarAmount = parseFloat(amountInput.value);
  if (!dollarAmount || dollarAmount <= 0) return;
  const price = state.prices[assetKey];
  const qty = dollarAmount / price;

  if (side === "buy") {
    if (dollarAmount > state.cash) return showModal("error", "Can't buy", "Not enough practice cash.");
    state.cash -= dollarAmount;
    state.holdings[assetKey] += qty;
  } else {
    if (qty > state.holdings[assetKey]) {
      const holdingValue = state.holdings[assetKey] * price;
      return showModal(
        "error",
        "Can't sell",
        `Not enough of this practice asset. You hold ${state.holdings[assetKey].toFixed(4)} (~${money(holdingValue)}).`
      );
    }
    state.holdings[assetKey] -= qty;
    state.cash += dollarAmount;
  }
  simSave(state);
  amountInput.value = "";
  patchSimulatorText(state);
}

function patchSimulatorText(state) {
  const el = document.getElementById("simulator");
  if (!el) return;
  const portfolioValue =
    state.cash + SIM_ASSETS.reduce((sum, a) => sum + state.holdings[a.key] * state.prices[a.key], 0);

  const cashEl = document.getElementById("sim-cash");
  const portfolioEl = document.getElementById("sim-portfolio");
  if (cashEl) cashEl.textContent = money(state.cash);
  if (portfolioEl) portfolioEl.textContent = money(portfolioValue);

  SIM_ASSETS.forEach((a) => {
    const priceEl = document.getElementById(`sim-price-${a.key}`);
    const holdingEl = document.getElementById(`sim-holding-${a.key}`);
    if (priceEl) priceEl.textContent = money(state.prices[a.key]);
    if (holdingEl) holdingEl.textContent = state.holdings[a.key].toFixed(4);
  });
}

function tickSimulatorPrices() {
  const el = document.getElementById("simulator");
  if (!el) return; // not on this view — nothing to tick
  const state = simState();
  SIM_ASSETS.forEach((a) => {
    const drift = (Math.random() - 0.5) * 0.04; // +/-2% per tick
    state.prices[a.key] = Math.max(1, state.prices[a.key] * (1 + drift));
  });
  simSave(state);
  patchSimulatorText(state);
}

function buildSimulator() {
  const el = document.getElementById("simulator");
  if (!el) return;
  const state = simState();

  el.innerHTML = `
    <div class="stat-grid">
      <div class="card stat-card">
        <div class="stat-label">Practice cash</div>
        <div class="stat-value" id="sim-cash"></div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Practice portfolio value</div>
        <div class="stat-value" id="sim-portfolio"></div>
      </div>
    </div>
    ${SIM_ASSETS.map(
      (a) => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
          <strong>${a.label}</strong>
          <span id="sim-price-${a.key}"></span> <span class="sim-tag">practice price</span>
        </div>
        <div style="font-size:0.82rem; color:var(--muted); margin-bottom:8px;">
          Holding: <span id="sim-holding-${a.key}"></span>
        </div>
        <input id="sim-amt-${a.key}" type="number" min="0" step="0.01" placeholder="Amount ($)" style="margin-bottom:8px;" />
        <div style="display:flex; gap:8px;">
          <button onclick="simTrade('${a.key}','buy')" style="flex:1;">Buy</button>
          <button onclick="simTrade('${a.key}','sell')" style="flex:1;">Sell</button>
        </div>
      </div>`
    ).join("")}
    <button onclick="simReset()" style="width:100%;">Reset practice portfolio</button>
  `;
  patchSimulatorText(state);
}

// Backward-compatible name used elsewhere to mean "make sure this is built."
function renderSimulator() {
  buildSimulator();
}
