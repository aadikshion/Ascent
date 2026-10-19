// Vercel entry: routes /api/* to the Express app (path passed via __p as a safety net)
const app = require('../server.js');
module.exports = (req, res) => {
  const m = req.url.match(/^\/api(?:\/index(?:\.js)?)?\?(?:.*&)?__p=([^&]*)/);
  if (m) req.url = '/api/' + decodeURIComponent(m[1]);
  return app(req, res);
};