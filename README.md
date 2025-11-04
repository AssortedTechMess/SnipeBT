# SnipeBT

A TypeScript-based Solana trading/sniping bot with modular AI features, strategy integrations, and notification support. This README explains what the bot does, the main components, configuration, how to get it running, and helpful notes for safe operation.

## Summary — what this bot does

- Connects to the Solana blockchain and interacts with token liquidity to place trades (snipes) and manage positions.
- Provides multiple strategy integrations (see `src/strategies`) and helper tools for single-trade testing (`oneTrade` scripts).
- Implements AI modules for adaptive learning, dynamic profit targets, candlestick monitoring, balance tracking, and trade intelligence (`src/ai*` files and `AI_*.md` docs).
- Integrates with external services/APIs: Raydium, Jupiter, CoinGecko, Dexscreener and supports Telegram/Twitter notifications.
- Exposes utility scripts for RPC checking, storing secrets, and running in development or live modes.

> Note: This project is TypeScript-based (runs via `ts-node` in development). It expects a Solana private key and RPC endpoints to be provided via environment variables.

## Quick start (recommended)

Prerequisites:
- Node.js 18+ (or a recent stable release)
- npm (or yarn)
- A Solana wallet private key (Base58-encoded) with funds for test/trading
- RPC endpoint(s) for Solana (mainnet-beta or testnet as desired)

1. Clone the repo

```powershell
git clone https://github.com/AssortedTechMess/SnipeBT.git
cd SnipeBT
```

2. Install dependencies

```powershell
npm install
```

3. Copy and fill the environment file

```powershell
copy .env.example .env
# Then open .env and fill the required values
```

Important env vars to set (see `.env.example`):
- `WALLET_PRIVATE_KEY` (Base58 private key for the Solana account) — KEEP THIS SECRET
- `RPC_URL` and `BACKUP_RPC_URL` — primary and fallback Solana RPC endpoints
- `RPC_WSS_URL` — optional websocket endpoint for faster streaming
- `ENVIRONMENT` — `development` or `production`
- Optional API keys: `HUGGINGFACE_TOKEN`, `OPENAI_API_KEY`, `TWITTER_BEARER_TOKEN` (used if AI/notifications features are enabled)
- Notification keys (Telegram bot token, chat IDs) if you want alerts

4. Run in development mode (auto-restarts):

```powershell
npm run dev
```

5. Or run the main entry directly in TypeScript (non-watch):

```powershell
npm start
```

6. Useful scripts
- `npm run check-rpc` — check RPC usage and health
- `npm run store-secret` — helper to store secrets (see `src/storeSecret.ts`)
- `npm run one-trade` — perform a single dry-run trade (useful for testing)
- `npm run one-trade-live` — performs a single confirmed live trade (use only when ready)
- `npm test` — run unit tests (Jest)

## Main files and folders
- `src/main.ts` — application entrypoint
- `src/config.ts` and `src/secureConfig.ts` — configuration and secure config helpers
- `src/ai*` — AI modules (adaptive learning, balance tracker, candlestick monitor, pricing cache, trade intelligence)
- `src/strategies` — strategy implementations (strategy files and strategy docs like `CANDLESTICK_STRATEGY.md`, `EMPERORBTC_STRATEGY.md`)
- `src/notifications.ts` — notification routing (Telegram, Twitter, etc.)
- `src/positionManager.ts`, `src/trade.ts`, `src/oneTrade.ts` — trading and position management
- `src/rpcLimiter.ts`, `src/rateLimit.ts`, `src/checkRPCUsage.ts` — RPC usage and rate-limiting helpers
- `scripts/run-live.ps1` — convenience PowerShell script to launch a live run on Windows
- `.env.example` — environment variables template (must be copied and completed)
- `package.json` — scripts & dependencies (entry point is `src/main.ts`)

## Features explained (high level)

- AI Adaptive Learning (`src/aiAdaptiveLearning.ts`, `AI_ADAPTIVE_LEARNING.md`)
  - Learns from past trades and market signals to adjust strategy parameters over time.
  - Can suggest or automatically modify profit targets and stop-loss behavior.

- AI Dynamic Profit Targets (`AI_DYNAMIC_PROFIT_TARGETS.md`)
  - Calculates profit targets dynamically based on market conditions rather than static percentages.

- Balance Tracker & RPC Optimization (`src/aiBalanceTracker.ts`, `AI_FULL_SYSTEM.md`)
  - Tracks wallet balances and uses intelligent RPC selection to minimize calls and avoid rate limits.

- Candlestick Strategy & Monitor (`CANDLESTICK_STRATEGY.md`, `src/aiCandlestickMonitor.ts`)
  - Implements candle-based signals for entry/exit. Useful for momentum/sniping strategies.

- Strategy Integrations (`src/strategyIntegration.ts`, `src/strategies/*`)
  - Strategy layer where multiple strategy implementations plug into the execution engine.

- Notifications (`src/notifications.ts`, `AI_NOTIFICATIONS.md`)
  - Sends trade and alert messages via Telegram, optionally Twitter or other channels. Configure tokens in `.env`.

- Safety & Rate Limits
  - RPC rate limiting and retries implemented (`rpcLimiter.ts`, `rateLimit.ts`) to avoid hitting provider limits.
  - `MAX_RETRIES`, `REQUEST_TIMEOUT_MS` and `LOG_LEVEL` are configurable in `.env`.

## Running a safe test (recommended first run)
1. Use a dev/test RPC and a test wallet with small funds.
2. Run one-trade in dry mode (read flags in `src/oneTrade.ts`):

```powershell
npm run one-trade
```

3. Inspect logs and/or enable notifications to verify the intended behavior before switching to live mode.
4. When you are confident, run a single live trade (careful — this will perform real transactions):

```powershell
npm run one-trade-live
# or use run-live.ps1 for scripted startup
```

## Configuration checklist before going live
- [ ] Double-check `WALLET_PRIVATE_KEY` and never commit it to Git.
- [ ] Ensure `RPC_URL` and `BACKUP_RPC_URL` are reliable (consider paid RPC providers for production).
- [ ] Set `ENVIRONMENT=production` for live runs.
- [ ] Make sure notifications are configured so you receive trade confirmations.
- [ ] Start with conservative strategy settings and small position sizes.

## Troubleshooting & common issues
- RPC failures / rate limits: increase `MAX_RETRIES`, configure a better RPC, or enable the AI RPC optimizer modules.
- Wallet signing errors: verify the `WALLET_PRIVATE_KEY` is Base58-encoded and corresponds to the expected account.
- Missing TS runtime errors: ensure `ts-node` is installed (it's included in dev dependencies). Consider building to `dist` and running compiled JS for production.

## Security notes
- Never commit `.env` with secrets. Use `.env.example` as a template.
- Use the provided `store-secret` helper and/or OS-level secret storage for production deployments.
- If running on a remote server, ensure proper firewalling and secure the machine’s user accounts and keys.

## Development notes & tests
- Project uses TypeScript and Jest. Run `npm test` to run unit tests.
- Use `npm run dev` to develop with `nodemon` and `ts-node`.

## Where to look next (documentation files included in the repo)
The repository contains multiple `.md` docs that go deeper into each feature and strategy. Examples:
- `AI_ADAPTIVE_LEARNING.md`
- `AI_INTEGRATION_GUIDE.md`
- `AI_NOTIFICATIONS.md`
- `AI_FULL_SYSTEM.md`
- `CANDLESTICK_STRATEGY.md`
- `DEPLOYMENT.md`
- `INTEGRATION_COMPLETE.md`

Read those files for detailed explanations and advanced configuration.


