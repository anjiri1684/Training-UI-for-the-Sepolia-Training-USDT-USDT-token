const $ = (id) => document.getElementById(id);
const statusEl = $("status");

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = kind || "";
}

function showModal(kind, title, message) {
  $("modalBox").className = "modal-box " + kind;
  $("modalIcon").textContent = kind === "success" ? "✓" : "!";
  $("modalTitle").textContent = title;
  $("modalMessage").textContent = message;
  $("modalOverlay").classList.remove("hidden");
}
function hideModal() {
  $("modalOverlay").classList.add("hidden");
}
$("modalCloseBtn").addEventListener("click", hideModal);
$("modalOverlay").addEventListener("click", (e) => {
  if (e.target === $("modalOverlay")) hideModal();
});

// Yes/no dialog. Resolves true on Continue, false on Cancel/backdrop click.
function showConfirm(title, message) {
  return new Promise((resolve) => {
    $("confirmTitle").textContent = title;
    $("confirmMessage").textContent = message;
    $("confirmOverlay").classList.remove("hidden");
    const done = (result) => {
      $("confirmOverlay").classList.add("hidden");
      resolve(result);
    };
    $("confirmOkBtn").onclick = () => done(true);
    $("confirmCancelBtn").onclick = () => done(false);
    $("confirmOverlay").onclick = (e) => {
      if (e.target === $("confirmOverlay")) done(false);
    };
  });
}

async function withLoading(btn, fn) {
  btn.classList.add("is-loading");
  btn.disabled = true;
  try {
    await fn();
  } finally {
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }
}

function toUnits(amountStr, dec) {
  const [whole, frac = ""] = amountStr.split(".");
  const fracPadded = (frac + "0".repeat(dec)).slice(0, dec);
  return BigInt(whole || "0") * 10n ** BigInt(dec) + BigInt(fracPadded || "0");
}

// Display formatting: pads/truncates an amount to the token's decimals the
// same way toUnits() does (truncation, not rounding), so what the confirm
// dialog shows is byte-for-byte what gets sent.
function padDecimals(amountStr, dec) {
  const [whole, frac = ""] = amountStr.split(".");
  return `${whole || "0"}.${(frac + "0".repeat(dec)).slice(0, dec)}`;
}

function fromUnitsBig(value, dec) {
  // TronLink's injected tronWeb can return uint256 contract results as a
  // BigNumber-like object rather than a native bigint/string, which
  // BigInt() can't convert directly (throws "Cannot convert object to a
  // BigInt"). Route through toString() first so this works no matter
  // which shape the wallet library hands back.
  const v = BigInt(typeof value === "object" && value !== null ? value.toString() : value);
  const base = 10n ** BigInt(dec);
  const whole = v / base;
  const frac = (v % base).toString().padStart(dec, "0");
  return `${whole}.${frac}`.replace(/0+$/, "").replace(/\.$/, "") || "0";
}

const ethereumAdapter = {
  name: "ethereum",
  addressPlaceholder: "0x...",
  connectionMode: "wallet",
  supportsApprovals: true,
  provider: null,
  signer: null,
  token: null,
  decimals: 6,
  address: null,

  getMetaMaskProvider() {
    if (!window.ethereum) return null;
    if (Array.isArray(window.ethereum.providers)) {
      const mm = window.ethereum.providers.find((p) => p.isMetaMask);
      if (mm) return mm;
    }
    if (window.ethereum.isMetaMask) return window.ethereum;
    return window.ethereum; 
  },


  async trySilentConnect() {
    const eth = this.getMetaMaskProvider();
    if (!eth || !eth.isMetaMask) return false;
    const accounts = await eth.request({ method: "eth_accounts" }).catch(() => []);
    if (!accounts || accounts.length === 0) return false;
    await this.connect();
    return true;
  },

  async connect() {
    const eth = this.getMetaMaskProvider();
    if (!eth) {
      throw new Error("No wallet found. Install MetaMask to use the Ethereum side.");
    }
    if (!eth.isMetaMask) {
      throw new Error(
        "Could not find MetaMask specifically — another wallet extension (e.g. TronLink) may be occupying the Ethereum connection slot. Try disabling other wallet extensions temporarily."
      );
    }
    this.eth = eth;
    await eth.request({ method: "eth_requestAccounts" });

    const currentChainHex = await eth.request({ method: "eth_chainId" });
    if (currentChainHex !== window.TRAINING_USDT_CONFIG.CHAIN_ID_HEX) {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: window.TRAINING_USDT_CONFIG.CHAIN_ID_HEX }],
      });
    }

    this.provider = new ethers.BrowserProvider(eth);
    this.signer = await this.provider.getSigner();
    this.address = await this.signer.getAddress();
    this.token = new ethers.Contract(
      window.TRAINING_USDT_CONFIG.CONTRACT_ADDRESS,
      window.TRAINING_USDT_ABI,
      this.signer
    );
    this.decimals = await this.token.decimals();
    return { label: "MetaMask", address: this.address };
  },

  async balance() {
    const raw = await this.token.balanceOf(this.address);
    return ethers.formatUnits(raw, this.decimals);
  },

  async totalSupply() {
    const raw = await this.token.totalSupply();
    return ethers.formatUnits(raw, this.decimals);
  },

  contractAddress() {
    return window.TRAINING_USDT_CONFIG.CONTRACT_ADDRESS;
  },

  async transfer(to, amount) {
    const tx = await this.token.transfer(to, ethers.parseUnits(amount, this.decimals));
    await tx.wait();
    return tx.hash;
  },

  async approve(spender, amount) {
    const tx = await this.token.approve(spender, ethers.parseUnits(amount, this.decimals));
    await tx.wait();
    return tx.hash;
  },

  async transferFrom(from, to, amount) {
    const tx = await this.token.transferFrom(from, to, ethers.parseUnits(amount, this.decimals));
    await tx.wait();
    return tx.hash;
  },

  isAddress(addr) {
    return ethers.isAddress(addr);
  },
};

const tronAdapter = {
  name: "tron",
  addressPlaceholder: "T...",
  connectionMode: "wallet", // real TronLink connection, self-custody
  supportsApprovals: false, // TRC-10 has no approve/transferFrom concept
  tronWeb: null,
  tokenId: null,
  decimals: 6,
  address: null,

  async trySilentConnect() {
    if (!window.tronWeb || !window.tronWeb.ready || !window.tronWeb.defaultAddress.base58) {
      return false;
    }
    await this.connect();
    return true;
  },

  async connect() {
    if (!window.tronLink) {
      throw new Error("No wallet found. Install TronLink to use the TRON side.");
    }
    const res = await window.tronLink.request({ method: "tron_requestAccounts" });
    if (res.code && res.code !== 200) {
      throw new Error("TronLink connection was not approved.");
    }
    if (!window.tronWeb || !window.tronWeb.ready) {
      throw new Error("TronLink is installed but not unlocked/ready. Open the extension and try again.");
    }


    let host = "";
    for (let i = 0; i < 5; i++) {
      host = (window.tronWeb.fullNode && window.tronWeb.fullNode.host) || "";
      if (host.toLowerCase().includes("nile")) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!host.toLowerCase().includes("nile")) {
      throw new Error(
        `TronLink doesn't look like it's on Nile Testnet (detected node: "${host || "unknown"}"). ` +
          'Switch networks inside the TronLink extension, then click "Connect TronLink" again.'
      );
    }

    this.tronWeb = window.tronWeb;
    this.address = this.tronWeb.defaultAddress.base58;
    this.tokenId = window.TRAINING_USDT_TRON_CONFIG.TOKEN_ID;
    const info = await this.tronWeb.trx.getTokenFromID(this.tokenId);
    this.decimals = Number(info.precision);
    await this.registerTokenWithWallet(info);
    return { label: "TronLink", address: this.address };
  },

  // TronLink's Send confirmation shows the raw base-unit amount
  // ("100,000,000") instead of "100.000000 TUSDT" for any TRC-10 asset
  // whose precision/symbol it hasn't cached yet — it deliberately
  // ignores decimals claimed by the calling dApp. Ask it once per
  // browser to add the asset, so confirmations format with the 6
  // decimals. A decline or an "Invalid Asset" rejection (freshly-issued
  // assets aren't always indexed by TronLink yet) is swallowed — the
  // next connect retries, and the Send view's note covers the raw-number
  // case meanwhile.
  async registerTokenWithWallet(info) {
    const storageKey = `tron_asset_registered_${this.tokenId}`;
    if (localStorage.getItem(storageKey)) return;
    try {
      await this.tronWeb.request({
        method: "wallet_watchAsset",
        params: {
          type: "trc10",
          options: {
            address: this.tokenId,
            symbol: info.abbr,
            decimals: this.decimals,
          },
        },
      });
      localStorage.setItem(storageKey, "1");
    } catch (_err) {
      // Not supported, already added, or user dismissed the prompt — fine.
    }
  },


  async balance() {
    const account = await this.tronWeb.trx.getAccount(this.address);
    const entry = (account.assetV2 || []).find((a) => a.key === this.tokenId);
    return fromUnitsBig(entry ? entry.value : 0, this.decimals);
  },

  async totalSupply() {
    const info = await this.tronWeb.trx.getTokenFromID(this.tokenId);
    return fromUnitsBig(info.total_supply, this.decimals);
  },

  contractAddress() {
    return `Token ID: ${this.tokenId}`;
  },

  async transfer(to, amount) {
    const raw = toUnits(amount, this.decimals);
    if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Amount too large for a single TRC-10 transfer.");
    }
    const result = await this.tronWeb.trx.sendToken(to, Number(raw), this.tokenId);
    const txid = result.txid || result.transaction?.txID;
    if (txid) await this.waitForConfirmation(txid);
    return txid || JSON.stringify(result);
  },


  async waitForConfirmation(txid, attempts = 15, delayMs = 2000) {
    for (let i = 0; i < attempts; i++) {
      const info = await this.tronWeb.trx.getTransactionInfo(txid).catch(() => null);
      if (info && info.id) return info;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  },

  isAddress(addr) {
    return this.tronWeb.isAddress(addr);
  },
};

const adapters = { ethereum: ethereumAdapter, tron: tronAdapter };
let current = ethereumAdapter;

function populateAccountSelect() {
  const select = $("accountSelect");
  const connectBtn = $("connectWalletBtn");
  if (current.connectionMode === "wallet") {
    select.classList.add("hidden");
    connectBtn.classList.remove("hidden");
    connectBtn.textContent = current.name === "ethereum" ? "Connect MetaMask" : "Connect TronLink";
    return;
  }
  connectBtn.classList.add("hidden");
  select.classList.remove("hidden");
  select.innerHTML = "";
  current.accounts.forEach((acc, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = acc.label;
    select.appendChild(opt);
  });
}

function updatePlaceholders() {
  ["sendTo", "approveSpender", "tfFrom", "tfTo"].forEach((id) => {
    $(id).placeholder = current.addressPlaceholder;
  });
}

async function connectSelectedAccount() {
  try {
    const idx = current.connectionMode === "wallet" ? undefined : parseInt($("accountSelect").value, 10);
    const { label, address } = await current.connect(idx);
    $("connectedAddr").textContent = `${label}: ${address}`;
    const network = current.name === "ethereum" ? "Ethereum Sepolia (real testnet)" : "TRON Nile (real testnet)";
    setStatus(`Connected to ${network} as ${label}.`, "ok");
    await refreshBalance();
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not connect.", "error");
  }
}

async function refreshBalance() {
  const formatted = await current.balance();
  $("tokBalance").textContent = formatted;
  $("tokBalanceHero").textContent = formatted;

  const usdPerToken =
    current.name === "ethereum"
      ? window.TRAINING_USDT_CONFIG.SIMULATED_USD_PER_TOKEN
      : window.TRAINING_USDT_TRON_CONFIG.SIMULATED_USD_PER_TOKEN;
  const usd = parseFloat(formatted) * usdPerToken;
  const usdFormatted = usd.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  $("usdBalance").textContent = usdFormatted;
  $("usdBalanceHero").textContent = usdFormatted;

  $("decimalsVal").textContent = current.decimals;
  $("contractAddrVal").textContent = current.contractAddress();
  $("receiveAddr").textContent = current.address;

  try {
    $("totalSupply").textContent = `${await current.totalSupply()} USDT`;
  } catch {
    $("totalSupply").textContent = "—";
  }
}

async function sendTransfer() {
  const to = $("sendTo").value.trim();
  const amount = $("sendAmount").value.trim();
  if (!current.isAddress(to) || !amount) {
    return showModal("error", "Can't send", "Enter a valid recipient address and amount.");
  }
  const num = Number(amount);
  if (!Number.isFinite(num) || num < 0) {
    return showModal("error", "Can't send", "Enter a valid amount.");
  }
  // Show the exact amount (with the token's decimal precision) before the
  // wallet popup opens. TronLink's own confirmation shows the raw base-unit
  // number (e.g. 100,000,000 for 100) and that display can't be changed from
  // the page — so this dialog is the authoritative "what you're sending".
  const displayAmount = padDecimals(
    num.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 }),
    current.decimals
  );
  const tronHint =
    current.name === "tron"
      ? "\n\nTronLink's popup may show the raw number (e.g. 100,000,000) — that's its own display; the amount above is exactly what gets sent."
      : "";
  const ok = await showConfirm("Confirm send", `Send ${displayAmount} USDT to ${to}?${tronHint}`);
  if (!ok) return;
  await withLoading($("sendBtn"), async () => {
    try {
      setStatus("Waiting for confirmation in your wallet...");
      const ref = await current.transfer(to, amount);
      setStatus("");
      showModal("success", "Transfer sent", `Confirmed on-chain.\n${ref}`);
      $("sendTo").value = "";
      $("sendAmount").value = "";
      await refreshBalance();
    } catch (err) {
      console.error(err);
      setStatus("");
      showModal("error", "Transfer failed", err.reason || err.message || "Something went wrong.");
    }
  });
}

async function approveSpender() {
  const spender = $("approveSpender").value.trim();
  const amount = $("approveAmount").value.trim();
  if (!current.isAddress(spender) || !amount) {
    return showModal("error", "Can't approve", "Enter a valid spender address and amount.");
  }
  await withLoading($("approveBtn"), async () => {
    try {
      setStatus("Waiting for confirmation in your wallet...");
      const ref = await current.approve(spender, amount);
      setStatus("");
      showModal("success", "Approval sent", `Confirmed on-chain.\n${ref}`);
    } catch (err) {
      console.error(err);
      setStatus("");
      showModal("error", "Approval failed", err.reason || err.message || "Something went wrong.");
    }
  });
}

async function doTransferFrom() {
  const from = $("tfFrom").value.trim();
  const to = $("tfTo").value.trim();
  const amount = $("tfAmount").value.trim();
  if (!current.isAddress(from) || !current.isAddress(to) || !amount) {
    return showModal("error", "Can't send", "Enter valid addresses and an amount.");
  }
  await withLoading($("tfBtn"), async () => {
    try {
      setStatus("Waiting for confirmation in your wallet...");
      const ref = await current.transferFrom(from, to, amount);
      setStatus("");
      showModal("success", "transferFrom sent", `Confirmed on-chain.\n${ref}`);
      await refreshBalance();
    } catch (err) {
      console.error(err);
      setStatus("");
      showModal("error", "transferFrom failed", err.reason || err.message || "Something went wrong.");
    }
  });
}


function updateApprovalNavVisibility() {
  const supported = current.supportsApprovals !== false;
  ["approve", "tf"].forEach((view) => {
    document.querySelector(`.side-link[data-view="${view}"]`).classList.toggle("hidden", !supported);
  });
  if (!supported) {
    const activeLink = document.querySelector(".side-link.active");
    if (activeLink && (activeLink.dataset.view === "approve" || activeLink.dataset.view === "tf")) {
      document.querySelector('.side-link[data-view="overview"]').click();
    }
  }
}

function setupChainTabs() {
  document.querySelectorAll(".chain-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".chain-tabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      current = adapters[tab.dataset.chain];
      updateApprovalNavVisibility();
      populateAccountSelect();
      updatePlaceholders();
      $("connectedAddr").textContent = "Not connected";
      $("tokBalance").textContent = "0";
      $("tokBalanceHero").textContent = "0";
      $("usdBalance").textContent = "0.00";
      $("usdBalanceHero").textContent = "0.00";
      $("receiveAddr").textContent = "Not connected";
      if (current.connectionMode === "wallet") {
        const btnLabel = current.name === "ethereum" ? "Connect MetaMask" : "Connect TronLink";
        setStatus(`Click "${btnLabel}" to get started.`, "ok");
        const connected = await current.trySilentConnect();
        if (connected) {
          const network = current.name === "ethereum" ? "Ethereum Sepolia (real testnet)" : "TRON Nile (real testnet)";
          $("connectedAddr").textContent = `${current.name === "ethereum" ? "MetaMask" : "TronLink"}: ${current.address}`;
          setStatus(`Reconnected to ${network} as ${current.address}.`, "ok");
          await refreshBalance();
        }
      } else {
        await connectSelectedAccount();
      }
    });
  });
}

const viewTitles = {
  overview: "Overview",
  send: "Send",
  approve: "Approve",
  tf: "Allowances (transferFrom)",
  receive: "Receive",
};

function setupViews() {
  const links = document.querySelectorAll(".side-link");
  links.forEach((link) => {
    link.addEventListener("click", () => {
      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      document.querySelectorAll(".view").forEach((view) => {
        view.classList.toggle("hidden", view.dataset.view !== link.dataset.view);
      });
      $("viewTitle").textContent = viewTitles[link.dataset.view] || "Overview";
    });
  });
}

async function copyAddress() {
  if (!current.address) return;
  try {
    await navigator.clipboard.writeText(current.address);
    setStatus("Address copied to clipboard.", "ok");
  } catch {
    setStatus(current.address, "ok");
  }
}

function setupCopyAddress() {
  $("copyAddrBtn").addEventListener("click", copyAddress);
  $("copyReceiveBtn").addEventListener("click", copyAddress);
}

populateAccountSelect();
updatePlaceholders();
setupChainTabs();
setupViews();
setupCopyAddress();
$("accountSelect").addEventListener("change", connectSelectedAccount);
$("connectWalletBtn").addEventListener("click", () =>
  withLoading($("connectWalletBtn"), connectSelectedAccount)
);
$("sendBtn").addEventListener("click", sendTransfer);
$("approveBtn").addEventListener("click", approveSpender);
$("tfBtn").addEventListener("click", doTransferFrom);


if (current.connectionMode !== "wallet") {
  connectSelectedAccount();
} else {
  setStatus('Click "Connect MetaMask" to get started.', "ok");
  current.trySilentConnect().then((connected) => {
    if (connected) {
      $("connectedAddr").textContent = `${current.name === "ethereum" ? "MetaMask" : "TronLink"}: ${current.address}`;
      const network = current.name === "ethereum" ? "Ethereum Sepolia (real testnet)" : "TRON Nile (real testnet)";
      setStatus(`Reconnected to ${network} as ${current.address}.`, "ok");
      refreshBalance();
    }
  });
}

const metaMaskProvider = ethereumAdapter.getMetaMaskProvider();
if (metaMaskProvider) {
  metaMaskProvider.on("chainChanged", () => window.location.reload());
  metaMaskProvider.on("accountsChanged", () => window.location.reload());
}
