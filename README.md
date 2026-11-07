# Mockex — live crypto paper trading (Liquid Glass UI)

Practise trading with live Binance prices and a virtual balance. **No real money, no exchange or broker accounts.**
*Paper trading is for education and practice only. Simulated results do not guarantee future performance.*

Built the same way as the "finnish" screenplay app: a single offline-first web app (`www/`) that runs in any browser,
installs as a PWA, and is wrapped into an **Android APK with Capacitor** through a GitHub Actions workflow.

## What is inside
| Area | Files |
|---|---|
| Paper-trading engine (market/limit/bracket, SL, TP, trailing, shorts, leverage, liquidation, fees, slippage, sizing, limits, duplicate guard) | `www/js/engine.js` |
| Indicators: SMA, EMA, RSI, MACD, Bollinger, ATR, VWAP, StochRSI, ADX, support/resistance | `www/js/indicators.js` |
| Binance WebSocket (backoff, host fallback, heartbeat/stale detection, re-subscribe) and REST (host fallback, timeouts) | `www/js/feed.js` |
| Market controller: tickers, klines with incremental cache, order book, trades, metals providers, offline demo feed | `www/js/market.js` |
| Canvas charts: candle/line/area, volume, overlays, sub-panels, drawing tools, pinch/pan, sparklines, donut | `www/js/chart.js` |
| Achievements, streaks, daily challenges, insights, leaderboard | `www/js/rewards.js` |
| App controller (tick pipeline, alerts, notifications, haptics, sheets, routing) and screens | `www/js/app.js`, `ui.js`, `ui2.js`, `ui3.js` |
| Liquid Glass design system | `www/css/app.css` |
| Optional cloud schema (Postgres + row level security + opt-in leaderboard) | `backend/schema.sql` |
| Tests | `tests/engine.test.js`, `tests/feed.test.js`, `tests/e2e/*` |

Screens: Onboarding, Home, Markets, Asset detail, Trade ticket (keypad, leverage, risk calculator, confirmation sheet), Portfolio, History + receipts, Alerts, Journal, Rewards, Profile/Settings.

## Run it
```bash
npm run serve            # http://localhost:8123  (any static server works: python3 -m http.server -d www 8123)
npm test                 # 26 unit/integration tests (engine, PnL, fees, SL/TP/trailing, sizing, WS reconnects, REST fallback)
npm install && npx playwright install chromium   # one-time, for e2e only
npm run e2e              # drives the UI in headless Chromium; second script mocks Binance REST + WebSocket
```
No environment variables or API keys are needed. Market data uses Binance **public** endpoints only.

## Build the Android APK (no Android Studio needed)
1. Push this folder to a GitHub repository.
2. GitHub → **Actions → Build Android APK → Run workflow** (or push a tag like `v1.0.0`).
3. Download the `Mockex-debug-apk` artifact and install `app-debug.apk` on your phone.

Locally instead: `npm install && npx cap add android && npx @capacitor/assets generate --android && npx cap sync android && cd android && ./gradlew assembleDebug`
(needs JDK 17 and the Android SDK). Icons and splash come from `assets/` (your Mockex icon and logo).
For a Play Store release you must create your own signing key; the workflow only produces a debug build.

## Windows EXE / web hosting
Host `www/` on any static host (GitHub Pages, Netlify, Cloudflare Pages). Serve over HTTPS so the service worker and notifications work.
For an EXE, wrap `www/` with Electron or Tauri the same way you did for finnish.

## Data sources
* **Crypto:** Binance spot, USDT pairs only (USDT ≈ USD so the USD account stays consistent). Search accepts any valid USDT symbol, e.g. `ARBUSDT`.
* **Metals (Gold/Silver):** *Profile → Data sources.* Default is Binance **PAXG/USDT** (tokenized gold, 1 token = 1 troy oz) for gold over WebSocket and **gold-api.com** spot polling for silver. You can switch to gold-api.com only, or a **custom JSON endpoint** (`{sym}` placeholder + JSON path). The source is labelled on every metal's asset page. Metals have no free historical candles, so their charts are built from live ticks while the app is used.
* **Offline:** if Binance is unreachable and nothing is cached, the app switches to clearly labelled **DEMO DATA** (simulated prices) and returns to live data automatically.

## Optional cloud backend
The app is fully functional offline with data on the device. `backend/schema.sql` is a ready Supabase/Postgres schema (owner-only row level security on every table, server-side duplicate-order guard, opt-in leaderboard that exposes only nickname + return %). Create a Supabase project, run the SQL, enable email auth. **The client does not sync to it yet** (see ROADMAP.md).

## Honest limitations
* Paper fills use the last price plus your slippage setting. Real order books, partial fills and funding are not modelled.
* The Liquid Glass look is CSS (backdrop blur, specular edges, animated aurora). A GPU **AGSL refraction shader** is not possible inside a WebView; it would need a native module. Older Android (<13) automatically uses a lighter blur.
* Local notifications fire while the app is running or backgrounded by the OS; guaranteed push delivery needs a server (roadmap).
* Leaderboard shows clearly labelled **sample** traders until the backend is connected.
* Markets list prices for non-watchlisted pairs refresh every ~30 s; watchlist, open positions, alerts and the open asset stream live.

## Security notes
No secrets are shipped. All user text is HTML-escaped before rendering, CSV export neutralises formula injection, imports are shape-validated, and a Content-Security-Policy restricts scripts to the app itself. Local data is not encrypted at rest (it is virtual money); with a backend, use Supabase Auth tokens in Android Keystore via a secure-storage plugin.
