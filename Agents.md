# Agents Notes

- App name: `MOON`
- Live PM2 checkout: `/data/moon`
- PM2 process name: `moon`
- Restart command: `pm2 restart moon`

## What this app is

- Bun + Hono + SQLite SaaS for multi-model AI routing.
- Moon-phase tiers:
  - `🌕` premium models
  - `🌓` efficient models
  - `🌑` always-on fallback models

## Deployment notes

- Styles are now served locally from `/styles.css`.
- CSS is compiled into `public/styles.css`.
- The app no longer depends on the Tailwind or DaisyUI CDN at runtime.

## DeepSeek

- DeepSeek official channel is wired in.
- Provider: `deepseek`
- Model: `deepseek-v4-flash`
- API key is loaded from `/data/moon/.env` via `DEEPSEEK_API_KEY`.

## Cautions

- Do not echo secrets from `.env`.
- Keep the live checkout and any worktree changes aligned when fixing deploy issues.
