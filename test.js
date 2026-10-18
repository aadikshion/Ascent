const { loadTokens } = require('./lib/data');
const { analyze, estimateBuybacks } = require('./lib/score');
(async () => {
  const res = (await loadTokens()).map(analyze);
  const bb = estimateBuybacks(res, 10000);
  res.forEach((r, i) => console.log(r.symbol.padEnd(6), 'score', String(r.score).padEnd(5), 'eligible', r.eligible, '| raw', r.rawHolders, 'eff', r.effHolders, '| top5', r.top5 + '%', '| clustered', r.clusteredShare + '%', '| buyback', bb[i].share + '%'));
})();
