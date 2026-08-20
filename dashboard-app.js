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

/** Disables a button and shows a spinner for the duration of an async action. */
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

function fromUnitsBig(value, dec) {
  const v = BigInt(value);
  const base = 10n ** BigInt(dec);
  const whole = v / base;
  const frac = (v % base).toString().padStart(dec, "0");
  return `${whole}.${frac}`.replace(/0+$/, "").replace(/\.$/, "") || "0";
}

const ethereumAdapter = {
  name: "ethereum",
  addressPlaceholder: "0x...",
  connectionMode: "wallet",
  provider: null,
  signer: null,
  token: null,
  decimals: 6,
  address: null,

  getMetaMaskProvider() {
    // Some other extensions (e.g. multi-chain TronLink builds) also inject
    // an Ethereum-style provider and can end up occupying window.ethereum.
    // If several providers are present, pick the one that identifies as
    // MetaMask specifically instead of trusting window.ethereum blindly.
    if (!window.ethereum) return null;
    if (Array.isArray(window.ethereum.providers)) {
      const mm = window.ethereum.providers.find((p) => p.isMetaMask);
      if (mm) return mm;
    }
    if (window.ethereum.isMetaMask) return window.ethereum;
    return window.ethereum; // best effort — no MetaMask flag found anywhere
  },

  // Checks whether MetaMask already granted this site permission, without
  // prompting. Lets us silently restore the connection after navigating
  // back to the page instead of forcing "Connect MetaMask" every time.
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
  tronWeb: null,
  contract: null,
  decimals: 6,
  address: null,

  // TronLink already exposes window.tronWeb.ready/defaultAddress if this
  // site was previously authorized — no prompt-triggering call needed to
  // check, unlike MetaMask.
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

    // window.tronWeb can take a moment to sync to the currently-selected
    // TronLink network right after tron_requestAccounts, so retry briefly
    // before concluding it's actually on the wrong network.
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
    this.contract = await this.tronWeb.contract(
      window.TRAINING_USDT_TRON_ABI,
      window.TRAINING_USDT_TRON_CONFIG.CONTRACT_ADDRESS
    );
    this.decimals = Number(await this.contract.decimals().call());
    await this.registerTokenWithWallet();
    return { label: "TronLink", address: this.address };
  },

  // TronLink's own Send confirmation screen reads decimals/symbol from
  // tokens it has explicitly added to its asset list — it does not trust
  // whatever a dApp's ABI claims (a phishing-prevention measure), so an
  // unregistered token shows as raw units with an "undefined" symbol.
  // wallet_watchAsset prompts the user once to add this token so future
  // confirmations render as "10.000000 TUSDT" instead. Best-effort: older
  // TronLink versions or a user declining the prompt just fall back to the
  // raw-unit display, so failures here are silently ignored.
  async registerTokenWithWallet() {
    try {
      const symbol = await this.contract.symbol().call();
      await this.tronWeb.request({
        method: "wallet_watchAsset",
        params: {
          type: "trc20",
          options: {
            address: window.TRAINING_USDT_TRON_CONFIG.CONTRACT_ADDRESS,
            symbol,
            decimals: this.decimals,
          },
        },
      });
    } catch (_err) {
      // Not supported, already added, or user dismissed the prompt — fine.
    }
  },

  async balance() {
    const raw = await this.contract.balanceOf(this.address).call();
    return fromUnitsBig(raw, this.decimals);
  },

  async totalSupply() {
    const raw = await this.contract.totalSupply().call();
    return fromUnitsBig(raw, this.decimals);
  },

  contractAddress() {
    return window.TRAINING_USDT_TRON_CONFIG.CONTRACT_ADDRESS;
  },

  async transfer(to, amount) {
    return await this.contract.transfer(to, toUnits(amount, this.decimals)).send();
  },

  async approve(spender, amount) {
    return await this.contract.approve(spender, toUnits(amount, this.decimals)).send();
  },

  async transferFrom(from, to, amount) {
    return await this.contract.transferFrom(from, to, toUnits(amount, this.decimals)).send();
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

function setupChainTabs() {
  document.querySelectorAll(".chain-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".chain-tabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      current = adapters[tab.dataset.chain];
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
        // Try to silently restore an already-authorized connection for
        // this chain instead of always requiring a fresh manual click.
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
  // If this site was already authorized in a previous visit, restore the
  // connection silently instead of making the user click Connect again.
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
