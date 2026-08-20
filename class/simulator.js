/**
 * Practice Simulator — a self-contained paper-trading game. Entirely
 * fake: fake starting balance, fake price ticks (a random walk seeded off
 * real prices once, then simulated locally), fake positions. Persisted
 * only in this browser's localStorage. Has NO connection to ClassChain
 * Token, your real balance, or any real account — labeled as practice
 * everywhere it appears.
 */
const SIM_ASSETS = [
  { key: "btc", label: "Bitcoin (practice)", price: 60000 },
  { key: "eth", label: "Ethereum (practice)", price: 3000 },
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
  renderSimulator();
}

function simTickPrices(state) {
  SIM_ASSETS.forEach((a) => {
    const drift = (Math.random() - 0.5) * 0.04; // +/-2% per tick
    state.prices[a.key] = Math.max(1, state.prices[a.key] * (1 + drift));
  });
}

function simTrade(assetKey, side) {
  const state = simState();
  const amountInput = document.getElementById(`sim-amt-${assetKey}`);
  const qty = parseFloat(amountInput.value);
  if (!qty || qty <= 0) return;
  const price = state.prices[assetKey];

  if (side === "buy") {
    const cost = qty * price;
    if (cost > state.cash) return alert("Not enough practice cash.");
    state.cash -= cost;
    state.holdings[assetKey] += qty;
  } else {
    if (qty > state.holdings[assetKey]) return alert("Not enough of this practice asset.");
    state.holdings[assetKey] -= qty;
    state.cash += qty * price;
  }
  simSave(state);
  renderSimulator();
}

function renderSimulator() {
  const el = document.getElementById("simulator");
  if (!el) return;
  const state = simState();
  simTickPrices(state);
  simSave(state);

  const portfolioValue =
    state.cash + SIM_ASSETS.reduce((sum, a) => sum + state.holdings[a.key] * state.prices[a.key], 0);

  el.innerHTML = `
    <div class="stat-grid">
      <div class="card stat-card">
        <div class="stat-label">Practice cash</div>
        <div class="stat-value">$${state.cash.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Practice portfolio value</div>
        <div class="stat-value">$${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
      </div>
    </div>
    ${SIM_ASSETS.map(
      (a) => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
          <strong>${a.label}</strong>
          <span>$${state.prices[a.key].toLocaleString(undefined, { maximumFractionDigits: 2 })} <span class="sim-tag">practice price</span></span>
        </div>
        <div style="font-size:0.82rem; color:var(--muted); margin-bottom:8px;">
          Holding: ${state.holdings[a.key].toFixed(4)}
        </div>
        <input id="sim-amt-${a.key}" type="number" min="0" step="0.0001" placeholder="Amount" style="margin-bottom:8px;" />
        <div style="display:flex; gap:8px;">
          <button onclick="simTrade('${a.key}','buy')" style="flex:1;">Buy</button>
          <button onclick="simTrade('${a.key}','sell')" style="flex:1;">Sell</button>
        </div>
      </div>`
    ).join("")}
    <button onclick="simReset()" style="width:100%;">Reset practice portfolio</button>
  `;
}
