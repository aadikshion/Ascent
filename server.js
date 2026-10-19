require('fs').existsSync('.env') && require('fs').readFileSync('.env', 'utf8').split('\n').forEach((l) => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; });
const express = require('express');
const path = require('path');
const { loadTokens, loadAny, mode } = require('./lib/data');
const { analyze, estimateBuybacks, CONFIG } = require('./lib/score');
const fs = require('fs');
const app = express();
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
function snapshot() { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'data.json'), 'utf8')); } catch (e) { return null; } }
const same = (t, id) => t.address.toLowerCase() === id.toLowerCase() || t.symbol.toLowerCase() === id.toLowerCase();
app.use(express.static(path.join(__dirname, 'public')));
let cache = { at: 0, data: null };
let inflight = null;
function getAll() {
  if (process.env.VERCEL) { const sn = snapshot(); if (sn) return Promise.resolve(sn.tokens); }
  if (cache.data && Date.now() - cache.at < 120000) return Promise.resolve(cache.data);
  if (!inflight) inflight = (async () => {
    console.log('refreshing data...');
    const res = (await loadTokens()).map(analyze);
    const bb = estimateBuybacks(res, Number(process.env.BUYBACK_POOL_USD || 10000));
    res.forEach((r, i) => { r.buyback = bb[i]; });
    cache = { at: Date.now(), data: res };
    console.log('data ready: ' + res.length + ' tokens');
    return res;
  })().finally(() => { inflight = null; });
  return inflight;
}
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(500).json({ error: e.message }); } };
app.get('/api/tokens', wrap(async (req, res) => { res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600'); const sn = process.env.VERCEL ? snapshot() : null;
  res.json({ mode: sn ? sn.mode : mode(), config: CONFIG, source: sn ? 'snapshot' : 'live', at: sn ? sn.at : Date.now(), tokens: await getAll() }); }));
app.get('/api/score/:id', wrap(async (req, res) => {
  const sn = process.env.VERCEL ? snapshot() : null;
  const hit = sn && sn.tokens.find((t) => same(t, req.params.id));
  if (hit) return res.json(hit);
  const raw = await loadAny(req.params.id);
  if (!raw) return res.status(404).json({ error: 'token not found' });
  const r = analyze(raw);
  r.buyback = { share: 0, usd: 0 };
  res.json(r);
}));
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
if (process.env.VERCEL) module.exports = app;
else app.listen(process.env.PORT || 3000, () => { getAll().catch((e) => console.error('load failed:', e.message)); console.log('Ascent running on port ' + (process.env.PORT || 3000)); });