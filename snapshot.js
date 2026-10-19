// Saves live scores to public/data.json so the deployed site loads instantly.
// Run in your Codespace (where live mode works):  npm run snapshot
const fs = require('fs');
if (fs.existsSync('.env')) fs.readFileSync('.env', 'utf8').split('\n').forEach((l) => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; });
const { loadTokens, mode } = require('./lib/data');
const { analyze, estimateBuybacks, CONFIG } = require('./lib/score');
(async () => {
  const res = (await loadTokens()).map(analyze);
  const bb = estimateBuybacks(res, Number(process.env.BUYBACK_POOL_USD || 10000));
  res.forEach((r, i) => { r.buyback = bb[i]; });
  const payload = { mode: mode(), config: CONFIG, at: Date.now(), tokens: res };
  fs.writeFileSync('public/data.json', JSON.stringify(payload));
  // Static API + badges: served by the CDN, no server function needed
  const { badgeSvg } = require('./lib/badge');
  const safe = (x) => String(x).replace(/[^A-Za-z0-9_-]/g, '');
  fs.mkdirSync('public/badges', { recursive: true }); fs.mkdirSync('public/v1/score', { recursive: true });
  for (const t of res) for (const k of new Set([safe(t.symbol), safe(t.address.toLowerCase())])) {
    fs.writeFileSync(`public/badges/${k}.svg`, badgeSvg(t));
    fs.writeFileSync(`public/v1/score/${k}.json`, JSON.stringify(t));
  }
  fs.writeFileSync('public/v1/tokens.json', JSON.stringify(payload));
  console.log('wrote public/data.json with ' + res.length + ' tokens (mode: ' + mode() + ')');
})().catch((e) => { console.error(e); process.exit(1); });