# MOON

MOON is a Bun + Hono + SQLite starter for the multi-model product.

## Run

```bash
bun install
bun run dev
```

## PM2

```bash
bun run pm2:start
```

The app defaults to port `8787` to avoid colliding with the workspace's existing `3000` listener.

## Scripts

- `bun run dev`: start the API with hot reload
- `bun run start`: start the API
- `bun run check`: typecheck the project
