import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { getConfig } from "./config";

const config = getConfig();
const databasePath = config.app.databasePath;

mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    has_used_free_trial INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    period TEXT NOT NULL DEFAULT 'monthly',
    status TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    model_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    out_trade_no TEXT NOT NULL UNIQUE,
    onepay_id TEXT,
    user_id TEXT,
    plan TEXT NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    fee INTEGER NOT NULL,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS cost_stats (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Migration: Add expires_at column to existing subscriptions table
try {
  db.exec("ALTER TABLE subscriptions ADD COLUMN expires_at TEXT");
} catch (e) {
  // Column may already exist, ignore error
}

// Migration: Add billing_cycle column to existing orders table
try {
  db.exec("ALTER TABLE orders ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly'");
} catch (e) {
  // Column may already exist, ignore error
}

// Migration: Add period column to existing subscriptions table
try {
  db.exec("ALTER TABLE subscriptions ADD COLUMN period TEXT NOT NULL DEFAULT 'monthly'");
} catch (e) {
  // Column may already exist, ignore error
}

// Migration: Add user_id column to orders table
try {
  db.exec("ALTER TABLE orders ADD COLUMN user_id TEXT");
} catch (e) {
  // Column may already exist, ignore error
}

// Migration: Create user_ai_preferences table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_ai_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      preferred_provider TEXT,
      preferred_model TEXT,
      preferred_tier TEXT NOT NULL DEFAULT '🌕',
      use_personal_api_key INTEGER NOT NULL DEFAULT 0,
      personal_api_key TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
} catch (e) {
  // Table may already exist, ignore error
}

// Migration: Create subscription_reminders table to track sent emails
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      days_before_expiration INTEGER NOT NULL,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      email TEXT NOT NULL,
      unsubscribe_token TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
} catch (e) {
  // Table may already exist, ignore error
}

// Migration: Add unsubscribe_token column to subscription_reminders table
try {
  db.exec("ALTER TABLE subscription_reminders ADD COLUMN unsubscribe_token TEXT");
} catch (e) {
  // Column may already exist, ignore error
}

// Migration: Add has_used_free_trial column to users table
try {
  db.exec("ALTER TABLE users ADD COLUMN has_used_free_trial INTEGER NOT NULL DEFAULT 0");
} catch (e) {
  // Column may already exist, ignore error
}