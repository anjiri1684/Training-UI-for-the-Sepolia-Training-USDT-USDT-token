/**
 * Market Reference panel — shows REAL public prices (via CoinGecko's free
 * public API) purely as educational context: "here's what a real market
 * looks like." This has no connection whatsoever to ClassChain Token,
 * which has no market, no price, and cannot be traded here or anywhere.
 */
async function loadMarketReference() {
  const el = document.getElementById("marketReference");
  if (!el) return;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd&include_24hr_change=true"
    );
    const data = await res.json();
    const rows = [
      { label: "Bitcoin", key: "bitcoin" },
      { label: "Ethereum", key: "ethereum" },
      { label: "Tether (real USDT)", key: "tether" },
    ];
    el.innerHTML = rows
      .map((r) => {
        const d = data[r.key];
        if (!d) return "";
        const change = d.usd_24h_change;
        const changeColor = change >= 0 ? "#2bd6a0" : "#ff6b6f";
        return `<tr>
          <td>${r.label}</td>
          <td>$${d.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
          <td style="color:${changeColor}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</td>
        </tr>`;
      })
      .join("");
  } catch {
    el.innerHTML = `<tr><td colspan="3">Could not load live prices right now.</td></tr>`;
  }
}
