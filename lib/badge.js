exports.badgeSvg = (t) => {
  const na = !t || t.noMarket;
  const s = !t ? '?' : na ? '—' : Math.round(t.score);
  const col = na ? '#777' : t.score >= 60 ? '#2ea043' : t.score >= 40 ? '#d29922' : '#da3633';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="22"><rect width="90" height="22" rx="4" fill="#222"/><rect x="90" width="60" height="22" rx="4" fill="${col}"/><g fill="#fff" font-family="Verdana,sans-serif" font-size="11"><text x="8" y="15">Ascent score</text><text x="104" y="15">${s}/100</text></g></svg>`;
};