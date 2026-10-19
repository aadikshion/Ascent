// Ascended Score: mirrors the criteria in the Ascend litepaper
// (market cap, unique holders, time-weighted volume, concentration/coordination checks).
// Thresholds are ILLUSTRATIVE: Ascend has not published exact numbers. Tune in CONFIG.
const { buildClusters } = require('./cluster');
const ZERO = '0x0000000000000000000000000000000000000000';
const CONFIG = {
  targets: { holders: 500, volume: 50000, mcap: 1000000 },
  weights: { holders: 0.30, volume: 0.25, mcap: 0.20, concentration: 0.25 },
  decay: 0.8,              // time-weighting for daily volume (index 0 = today)
  top5Free: 25,            // % of supply the top-5 entities can hold before penalty
  maxCoordPenalty: 40,
  eligibleScore: 60,
  dustPct: 0.001           // wallets below 0.001% of supply don't count as holders
};
const clamp = (x, a = 0, b = 100) => Math.min(b, Math.max(a, x));
const logScale = (v, target) => 100 * Math.pow(clamp(Math.log10(1 + Math.max(0, v)) / Math.log10(1 + target) * 100) / 100, 2.5);
const r1 = (x) => Math.round(x * 10) / 10;

function analyze(t) {
  const excl = new Set([t.pool, ZERO, ...(t.excluded || [])].filter(Boolean).map((a) => a.toLowerCase()));
  const bal = new Map();
  if (t.balances) {
    for (const h of t.balances) { const a = h.addr.toLowerCase(); if (!excl.has(a)) bal.set(a, h.value); }
  } else {
    for (const x of t.transfers) {
      const f = x.from.toLowerCase(), to = x.to.toLowerCase();
      if (!excl.has(f)) bal.set(f, (bal.get(f) || 0) - x.value);
      if (!excl.has(to)) bal.set(to, (bal.get(to) || 0) + x.value);
    }
  }
  const supply = t.totalSupply;
  const holders = [...bal].filter(([, v]) => v > supply * (CONFIG.dustPct / 100));
  const { find, tags } = buildClusters(t.transfers, excl);

  const ents = new Map();
  for (const [addr, v] of holders) {
    const root = find(addr);
    if (!ents.has(root)) ents.set(root, { members: [], balance: 0, reasons: new Set() });
    const e = ents.get(root);
    e.members.push(addr); e.balance += v;
    (tags.get(addr) || []).forEach((r) => e.reasons.add(r));
  }
  const entities = [...ents.values()].sort((a, b) => b.balance - a.balance);
  const rawHolders = holders.length;
  const effHolders = entities.length;
  const top5 = (entities.slice(0, 5).reduce((s, e) => s + e.balance, 0) / supply) * 100;
  const clustered = entities.filter((e) => e.members.length >= 2);
  const clusteredShare = (clustered.reduce((s, e) => s + e.balance, 0) / supply) * 100;

  const vol = t.dailyVolume || [];
  let wsum = 0, vsum = 0;
  vol.forEach((v, i) => { const w = Math.pow(CONFIG.decay, i); wsum += w; vsum += w * v; });
  const twVolume = wsum ? vsum / wsum : 0;

  const comp = {
    holders: logScale(effHolders, CONFIG.targets.holders),
    volume: logScale(twVolume, CONFIG.targets.volume),
    mcap: logScale(t.marketCap, CONFIG.targets.mcap),
    concentration: clamp(100 - Math.max(0, top5 - CONFIG.top5Free) * 3)
  };
  const W = CONFIG.weights;
  const base = comp.holders * W.holders + comp.volume * W.volume + comp.mcap * W.mcap + comp.concentration * W.concentration;
  const penalty = Math.min(CONFIG.maxCoordPenalty, clusteredShare * 0.6);
  const score = clamp(base - penalty);

  const flags = [];
  (t.notes || []).forEach((n) => flags.push({ level: 'info', text: n }));
  clustered.filter((e) => e.balance / supply >= 0.01).forEach((e) => flags.push({
    level: e.balance / supply > 0.1 ? 'critical' : 'warn',
    text: `${r1((e.balance / supply) * 100)}% of supply sits in ${e.members.length} linked wallets (${[...e.reasons].join(', ')})`
  }));
  const depBal = t.deployer ? bal.get(t.deployer.toLowerCase()) : 0;
  if (depBal && depBal / supply > 0.05) flags.push({ level: depBal / supply > 0.2 ? 'critical' : 'warn', text: `Deployer wallet holds ${r1((depBal / supply) * 100)}% of supply` });
  if (!t.marketCap) flags.push({ level: 'info', text: 'No market data yet (no price or trades), so this token cannot qualify' });
  if (top5 > 30) flags.push({ level: 'critical', text: `Top 5 holders control ${r1(top5)}% of supply` });
  else if (top5 > CONFIG.top5Free) flags.push({ level: 'warn', text: `Top 5 holders control ${r1(top5)}% of supply` });
  if (rawHolders - effHolders >= 5) flags.push({ level: 'info', text: `${rawHolders} wallets collapse to ${effHolders} independent holders` });
  if (twVolume < 1000) flags.push({ level: 'warn', text: 'Very low time-weighted volume' });

  const eligible = score >= CONFIG.eligibleScore && t.marketCap > 0 && !flags.some((f) => f.level === 'critical');

  const path = [];
  if (comp.holders < 70) path.push(`Grow independent holders: ${effHolders} now, aim for ${CONFIG.targets.holders}+`);
  if (comp.volume < 70) path.push(`Raise sustained volume: ~$${Math.round(twVolume)}/day time-weighted, aim for $${CONFIG.targets.volume}+`);
  if (comp.mcap < 70) path.push(`Grow market cap toward $${CONFIG.targets.mcap.toLocaleString()}`);
  if (comp.concentration < 80) path.push(`Reduce top-5 concentration from ${r1(top5)}% to under ${CONFIG.top5Free}%`);
  if (clusteredShare > 5) path.push('Distribute or explain linked-wallet supply before applying for Ascended status');
  if (eligible) path.push('Likely qualifies. Next: build listing fund for HyperCore (creator fee set-aside)');

  return {
    address: t.address, symbol: t.symbol, source: t.source || null, creator: t.creator || null, marketCap: t.marketCap,
    score: r1(score), eligible, noMarket: !t.marketCap, listedHolders: t.listedHolders || null, components: Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, r1(v)])),
    penalty: r1(penalty), rawHolders, effHolders, twVolume: Math.round(twVolume),
    top5: r1(top5), clusteredShare: r1(clusteredShare), flags, path,
    topEntities: entities.slice(0, 8).map((e) => ({
      share: r1((e.balance / supply) * 100), wallets: e.members.length, reasons: [...e.reasons],
      sample: e.members[0]
    }))
  };
}

// Estimates each token's slice of the buyback pool (litepaper: weighted by holders, volume over time, market cap).
function estimateBuybacks(results, poolUsd) {
  const el = results.filter((r) => r.eligible);
  const sum = (k) => el.reduce((s, r) => s + r[k], 0) || 1;
  const sH = sum('effHolders'), sV = sum('twVolume'), sM = sum('marketCap');
  return results.map((r) => {
    if (!r.eligible) return { share: 0, usd: 0 };
    const w = (0.4 * r.effHolders / sH + 0.4 * r.twVolume / sV + 0.2 * r.marketCap / sM) * (1 - r.clusteredShare / 100);
    return { share: w };
  }).map((x, _, arr) => {
    const tot = arr.reduce((s, y) => s + (y.share || 0), 0) || 1;
    const share = (x.share || 0) / tot;
    return { share: r1(share * 100), usd: Math.round(share * poolUsd) };
  });
}
module.exports = { analyze, estimateBuybacks, CONFIG };