// Finds tokens created by (or interacting with) a launchpad contract via the explorer API.
// Usage: LIVE=1 node discover.js 0xLAUNCHPAD   -> prints candidate token addresses; paste good ones into tokens.json
const API = (process.env.EXPLORER_API || 'https://elysium.kinetiq.xyz/api/v2').replace(/\/$/, '');
const j = async (p) => { const r = await fetch(API + p); if (!r.ok) throw new Error(r.status + ' ' + p); return r.json(); };
(async () => {
  const a = process.argv[2];
  if (!a) return console.log('usage: node discover.js <launchpad address>');
  const found = new Map();
  for (const path of [`/addresses/${a}/internal-transactions`, `/addresses/${a}/transactions`, `/addresses/${a}/token-transfers`]) {
    try {
      const d = await j(path);
      for (const i of d.items || []) {
        const c = (i.created_contract && i.created_contract.hash) || (i.token && i.token.address_hash) || (i.token && i.token.address);
        if (c) found.set(c.toLowerCase(), (i.token && i.token.symbol) || (i.created_contract && i.created_contract.name) || '?');
      }
    } catch (e) { console.log('skip', path, e.message); }
  }
  console.log([...found].map(([addr, n]) => `${n}\t${addr}`).join('\n') || 'nothing found: check the address on the explorer, or ask Ascend for token addresses');
})();