require('fs').existsSync('.env') && require('fs').readFileSync('.env', 'utf8').split('\n').forEach((l) => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; });
const express = require('express');
const path = require('path');
const { loadTokens } = require('./lib/data');
const { analyze, estimateBuybacks, CONFIG } = require('./lib/score');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
let cache = { at: 0, data: null };
async function getAll() {
  if (cache.data && Date.now() - cache.at < 60000) return cache.data;
  const res = (await loadTokens()).map(analyze);
  const bb = estimateBuybacks(res, Number(process.env.BUYBACK_POOL_USD || 10000));
  res.forEach((r, i) => { r.buyback = bb[i]; });
  cache = { at: Date.now(), data: res };
  return res;
}
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(500).json({ error: e.message }); } };
app.get('/api/tokens', wrap(async (req, res) => res.json({ mode: process.env.RPC_URL ? 'live' : 'demo', config: CONFIG, tokens: await getAll() })));
app.get('/api/tokens/:addr', wrap(async (req, res) => {
  const t = (await getAll()).find((x) => x.address.toLowerCase() === req.params.addr.toLowerCase() || x.symbol.toLowerCase() === req.params.addr.toLowerCase());
  t ? res.json(t) : res.status(404).json({ error: 'not found' });
}));
app.get('/api/badge/:addr.svg', wrap(async (req, res) => {
  const t = (await getAll()).find((x) => x.address.toLowerCase() === req.params.addr.toLowerCase() || x.symbol.toLowerCase() === req.params.addr.toLowerCase());
  const s = t ? Math.round(t.score) : '?';
  const col = !t ? '#777' : t.score >= 60 ? '#2ea043' : t.score >= 40 ? '#d29922' : '#da3633';
  res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="22"><rect width="90" height="22" fill="#222"/><rect x="90" width="60" height="22" fill="${col}"/><g fill="#fff" font-family="Verdana" font-size="11"><text x="8" y="15">Ascent score</text><text x="104" y="15">${s}/100</text></g></svg>`);
}));
app.listen(process.env.PORT || 3000, () => console.log('Ascent running on port ' + (process.env.PORT || 3000)));
