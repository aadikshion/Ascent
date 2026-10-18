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

async function loadTokens() {
  if (!process.env.RPC_URL) return demoTokens();
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const list = JSON.parse(fs.readFileSync(process.env.TOKENS_FILE || 'tokens.json', 'utf8'));
  const out = [];
  for (const cfg of list) { try { out.push(await liveToken(provider, cfg, ethers)); } catch (e) { console.error('skip', cfg.symbol, e.message); } }
  return out;
}
module.exports = { loadTokens };
