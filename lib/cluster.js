// Coordination detector: groups wallets that look controlled by one actor.
// Heuristics (all derived from ERC-20 Transfer logs only):
//  1. SAME-BLOCK BUNDLE: >=3 distinct wallets receive from the pool in the same block
//  2. COMMON FUNDER: a non-pool wallet sends tokens to >=3 distinct wallets
function buildClusters(transfers, excl) {
  const parent = new Map();
  const tags = new Map();
  const find = (a) => {
    if (!parent.has(a)) parent.set(a, a);
    while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); }
    return a;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const tag = (a, t) => { if (!tags.has(a)) tags.set(a, new Set()); tags.get(a).add(t); };

  const byBlock = new Map();
  const byFunder = new Map();
  for (const x of transfers) {
    const f = x.from.toLowerCase(), t = x.to.toLowerCase();
    if (excl.has(f) && !excl.has(t)) {
      if (!byBlock.has(x.block)) byBlock.set(x.block, new Set());
      byBlock.get(x.block).add(t);
    } else if (!excl.has(f) && !excl.has(t) && f !== t) {
      if (!byFunder.has(f)) byFunder.set(f, new Set());
      byFunder.get(f).add(t);
    }
  }
  for (const set of byBlock.values()) {
    if (set.size >= 3) { const a = [...set]; a.forEach((w) => { union(a[0], w); tag(w, 'same-block bundle'); }); }
  }
  for (const [funder, set] of byFunder) {
    if (set.size >= 3) { set.forEach((w) => { union(funder, w); tag(w, 'common funder'); }); tag(funder, 'common funder'); }
  }
  return { find, tags };
}
module.exports = { buildClusters };
