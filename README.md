# Ascent: Ascended Score Engine (Ascend x Elysium)

Scores every Ascend token against the litepaper's qualification criteria, detects coordinated wallets,
estimates buyback share and tells creators what to fix.

    npm install
    npm start        # demo mode, open port 3000
    npm test         # prints scores in terminal

Live mode: copy `.env.example` to `.env`, set RPC_URL (Elysium RPC), copy `tokens.example.json` to `tokens.json`
and fill in token, pool and deployer addresses.

API: /api/tokens, /api/tokens/:addressOrSymbol, /api/badge/:addressOrSymbol.svg
Scoring thresholds live in CONFIG at the top of lib/score.js (illustrative, Ascend has not published exact numbers).
