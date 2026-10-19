const fs = require('fs');
const POOL = '0x' + 'a'.repeat(40), DEPLOYER = '0x' + 'd'.repeat(40);

function rng(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- DEMO MODE ----------
function mockToken(sym, seed, p) {
  const r = rng(seed), SUPPLY = 1e9, transfers = [];
  const addr = () => '0x' + Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
  let block = 1000;
  for (let i = 0; i < p.organic; i++) {
    block += 1 + Math.floor(r() * 50);
    transfers.push({ from: POOL, to: addr(), value: SUPPLY * (Math.pow(r(), 3) * 0.002 + 0.00003), block });
  }
  if (p.bundle) { block += 10; for (let i = 0; i < p.bundle.n; i++) transfers.push({ from: POOL, to: addr(), value: SUPPLY * p.bundle.pct / 100 / p.bundle.n, block }); }
  if (p.funder) {
    const f = addr(); block += 20;
    transfers.push({ from: POOL, to: f, value: SUPPLY * p.funder.pct / 100, block });
    for (let i = 0; i < p.funder.n; i++) transfers.push({ from: f, to: addr(), value: SUPPLY * p.funder.pct / 100 / p.funder.n * 0.95, block: block + 5 + i });
  }
  (p.whales || []).forEach((pct) => { block += 30; transfers.push({ from: POOL, to: addr(), value: SUPPLY * pct / 100, block }); });
  return { address: '0x' + sym.toLowerCase().padEnd(40, '0').slice(0, 40), symbol: sym, pool: POOL, deployer: DEPLOYER, totalSupply: SUPPLY, transfers, marketCap: p.mcap, dailyVolume: p.vol };
}
function demoTokens() {
  return [
    mockToken('ZEUS', 1, { organic: 420, whales: [3], mcap: 900000, vol: [60000, 52000, 48000, 40000, 35000, 30000, 20000] }),
    mockToken('BUNDL', 2, { organic: 60, bundle: { n: 25, pct: 38 }, funder: { n: 8, pct: 10 }, mcap: 700000, vol: [90000, 85000, 20000, 5000, 3000, 2000, 1000] }),
    mockToken('WHALE', 3, { organic: 140, whales: [14, 12, 11], mcap: 400000, vol: [20000, 18000, 15000, 12000, 9000, 8000, 5000] }),
    mockToken('FRESH', 4, { organic: 25, mcap: 40000, vol: [4000, 3000, 500, 0, 0, 0, 0] }),
    mockToken('ORBIT', 5, { organic: 260, whales: [5], funder: { n: 4, pct: 3 }, mcap: 520000, vol: [30000, 28000, 26000, 20000, 15000, 14000, 12000] })
  ];
}

// ---------- LIVE MODE (Elysium RPC + ERC-20 Transfer logs) ----------
async function liveToken(provider, cfg, ethers) {
  const abi = ['event Transfer(address indexed from,address indexed to,uint256 value)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)'];
  const c = new ethers.Contract(cfg.address, abi, provider);
  const [dec, ts, head] = await Promise.all([c.decimals(), c.totalSupply(), provider.getBlockNumber()]);
  const toNum = (v) => Number(ethers.formatUnits(v, dec));
  const transfers = [];
  const STEP = 5000;
  for (let from = cfg.fromBlock || 0; from <= head; from += STEP) {
    const logs = await c.queryFilter(c.filters.Transfer(), from, Math.min(head, from + STEP - 1));
    for (const l of logs) transfers.push({ from: l.args[0], to: l.args[1], value: toNum(l.args[2]), block: l.blockNumber });
  }
  return { ...cfg, totalSupply: toNum(ts), transfers };
}

// ---------- LIVE MODE A: Blockscout explorer API (recommended) ----------
const API = () => (process.env.EXPLORER_API || 'https://elysium.kinetiq.xyz/api/v2').replace(/\/$/, '');
async function jget(path) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(API() + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.ok) return r.json();
    if (r.status === 429) await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
    else throw new Error(`explorer ${r.status} on ${path}`);
  }
  throw new Error('explorer rate-limited on ' + path);
}
async function paged(path, maxPages) {
  const items = []; let next = null;
  for (let p = 0; p < maxPages; p++) {
    const qs = next ? (path.includes('?') ? '&' : '?') + new URLSearchParams(next) : '';
    const d = await jget(path + qs);
    items.push(...(d.items || []));
    next = d.next_page_params;
    if (!next) break;
  }
  return items;
}
// The pool/hook that launched supply is the address with the largest net token outflow.
function inferPool(transfers) {
  const net = new Map();
  for (const x of transfers) {
    const f = x.from.toLowerCase(), t = x.to.toLowerCase();
    net.set(f, (net.get(f) || 0) + x.value); net.set(t, (net.get(t) || 0) - x.value);
  }
  let best = null, max = 0;
  for (const [a, v] of net) if (v > max) { max = v; best = a; }
  return best;
}
async function loadOne(address, cfg = {}) {
  const meta = await jget(`/tokens/${address}`);
  const dec = Number(meta.decimals ?? 18);
  const supply = Number(meta.total_supply) / 10 ** dec;
  const raw = await paged(`/tokens/${address}/transfers`, Number(process.env.MAX_PAGES || 10));
  const transfers = raw.map((x) => ({
    from: x.from && x.from.hash, to: x.to && x.to.hash,
    value: Number((x.total && x.total.value) || 0) / 10 ** Number((x.total && x.total.decimals) ?? dec),
    block: x.block_number ?? x.block ?? 0, ts: x.timestamp ? Date.parse(x.timestamp) : 0
  })).filter((x) => x.from && x.to).sort((a, b) => a.block - b.block);
  const pool = cfg.pool || inferPool(transfers);
  let deployer = cfg.deployer;
  if (!deployer) { try { deployer = (await jget(`/addresses/${address}`)).creator_address_hash; } catch (e) { /* optional */ } }
  const price = cfg.priceUsd ?? (Number(meta.exchange_rate) || null);
  const notes = [];
  // Authoritative balances from the explorer's holder list (transfer history may be truncated).
  let balances = null, excluded = [];
  try {
    const hs = await paged(`/tokens/${address}/holders`, Number(process.env.HOLDER_PAGES || 20));
    balances = hs.map((h) => ({ addr: (h.address && h.address.hash) || '', value: Number(h.value || 0) / 10 ** dec })).filter((h) => h.addr);
    excluded = hs.filter((h) => h.address && h.address.is_contract).map((h) => h.address.hash);
  } catch (e) { notes.push('Holder list unavailable: balances rebuilt from partial transfer history'); }
  if (!cfg.pool) notes.push('Pool address inferred from transfers (set "pool" in tokens.json to confirm)');
  if (!price && cfg.marketCap == null) notes.push('No price source yet: market cap and volume cannot be scored (needs Ascend pool price)');
  const marketCap = cfg.marketCap ?? (price ? price * supply : Number(meta.circulating_market_cap) || 0);
  let dailyVolume = cfg.dailyVolume;
  if (!dailyVolume) {
    dailyVolume = [0, 0, 0, 0, 0, 0, 0]; const now = Date.now();
    for (const x of transfers) {
      if (!x.ts || !price) continue;
      if (pool && (x.from.toLowerCase() === pool || x.to.toLowerCase() === pool)) {
        const i = Math.floor((now - x.ts) / 86400000);
        if (i >= 0 && i < 7) dailyVolume[i] += x.value * price;
      }
    }
  }
  if (cfg.dailyVolume == null && Number(meta.volume_24h) > 0) dailyVolume[0] = Math.max(dailyVolume[0], Number(meta.volume_24h));
  if (excluded.length) notes.push(`${excluded.length} contract holder(s) (pools/hooks/lockers) excluded from holder metrics`);
  return { address, symbol: meta.symbol || address.slice(0, 8), pool, deployer, totalSupply: supply, transfers, balances, excluded, listedHolders: Number(meta.holders_count) || null, marketCap, dailyVolume, notes };
}
// Auto-discovery: tokens created via the Ascend launchpad + the top Elysium tokens by holders.
async function discoverTokens() {
  const found = new Map();
  const add = (a, source) => { if (a && !found.has(a.toLowerCase())) found.set(a.toLowerCase(), { address: a, source }); };
  const lp = process.env.ASCEND_LAUNCHPAD || '0xc05193a68ED25df678bB7d6644D081BffDAA01D9'; // unconfirmed: override via env
  for (const p of ['internal-transactions', 'transactions', 'token-transfers']) {
    try {
      for (const i of await paged(`/addresses/${lp}/${p}`, 5)) add((i.created_contract && i.created_contract.hash) || (i.token && (i.token.address_hash || i.token.address)), 'ascend');
    } catch (e) { console.error('discover skip', p, e.message); }
  }
  try {
    const d = await jget('/tokens?type=ERC-20');
    (d.items || []).slice(0, Number(process.env.TOP_TOKENS || 10)).forEach((i) => add(i.address_hash || i.address, 'elysium'));
  } catch (e) { console.error('discover skip tokens', e.message); }
  return [...found.values()];
}
async function loadExplorer() {
  const f = [process.env.TOKENS_FILE, 'watchlist.json', 'tokens.json'].find((x) => x && fs.existsSync(x));
  const pinned = f ? JSON.parse(fs.readFileSync(f, 'utf8')).map((c) => ({ ...c, source: 'pinned' })) : [];
  const disc = process.env.AUTO_DISCOVER === '0' ? [] : await discoverTokens();
  const asc = new Set(disc.filter((d) => d.source === 'ascend').map((d) => d.address.toLowerCase()));
  const seen = new Set(pinned.map((p) => p.address.toLowerCase()));
  const list = pinned.concat(disc.filter((d) => !seen.has(d.address.toLowerCase()))).slice(0, Number(process.env.TOKEN_LIMIT || 30));
  const skip = new Set((process.env.EXCLUDE_SYMBOLS || 'USDC,USDT,HYPE,WHYPE,KHYPE').split(',').map((x) => x.trim().toUpperCase()));
  const out = [];
  for (let i = 0; i < list.length; i += 4) {
    const res = await Promise.all(list.slice(i, i + 4).map(async (cfg) => {
      const t0 = Date.now();
      try {
        const t = await loadOne(cfg.address, cfg);
        t.source = asc.has(cfg.address.toLowerCase()) ? 'ascend' : cfg.source;
        if (skip.has(String(t.symbol).toUpperCase())) return null;
        console.log(`loaded ${t.symbol} [${t.source}] in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        return t;
      } catch (e) { console.error('skip', cfg.address, e.message); return null; }
    }));
    out.push(...res.filter(Boolean));
  }
  return out;
}

// ---------- LIVE MODE B: raw RPC logs (fallback) ----------
async function loadRpc() {
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const list = JSON.parse(fs.readFileSync(process.env.TOKENS_FILE || 'tokens.json', 'utf8'));
  const out = [];
  for (const cfg of list) { try { out.push(await liveToken(provider, cfg, ethers)); } catch (e) { console.error('skip', cfg.symbol, e.message); } }
  return out;
}

const mode = () => (process.env.LIVE === '1' || process.env.EXPLORER_API ? 'live' : process.env.RPC_URL ? 'live-rpc' : 'demo');
async function loadTokens() {
  const m = mode();
  return m === 'live' ? loadExplorer() : m === 'live-rpc' ? loadRpc() : demoTokens();
}
async function loadAny(id) {
  if (mode() === 'live') return loadOne(id);
  return demoTokens().find((t) => t.symbol.toLowerCase() === id.toLowerCase() || t.address.toLowerCase() === id.toLowerCase());
}
module.exports = { loadTokens, loadAny, loadOne, mode };