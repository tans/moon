/**
 * Configuration management for MOON
 * Loads .env file and validates required environment variables
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env file manually (Bun doesn't have native dotenv support)
function loadEnvFile(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Load env before any other processing
loadEnvFile();

export interface AppConfig {
  port: number;
  databasePath: string;
  jwtSecret: string;
  isProduction: boolean;
}

export interface SMTPConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export interface AIProviderKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  kimi?: string;
  minimax?: string;
  qwen?: string;
  deepseek?: string;
}

export interface ModelSource {
  provider: "openai" | "anthropic";
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface Config {
  app: AppConfig;
  aiProviders: AIProviderKeys;
  smtp?: SMTPConfig;
}

const REQUIRED_APP_VARS = ["JWT_SECRET"] as const;
const REQUIRED_AI_VARS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "KIMI_API_KEY",
  "MINIMAX_API_KEY",
  "QWEN_API_KEY",
] as const;

type RequiredAppVar = (typeof REQUIRED_APP_VARS)[number];
type RequiredAIVar = (typeof REQUIRED_AI_VARS)[number];

interface ValidationError {
  missing: string[];
  suggestions: string[];
}

function validateConfig(): void {
  const errors: ValidationError = {
    missing: [],
    suggestions: [],
  };

  // Validate required app variables
  for (const varName of REQUIRED_APP_VARS) {
    if (!process.env[varName]) {
      errors.missing.push(varName);
    }
  }

  // Check if JWT_SECRET is the default (security risk)
  if (process.env.JWT_SECRET === "moon-secret-key-change-in-production") {
    errors.suggestions.push(
      "JWT_SECRET is using the default value. Set a secure random secret in production."
    );
  }

  if (errors.missing.length > 0 || errors.suggestions.length > 0) {
    console.warn("\nConfiguration Warning:");
    if (errors.missing.length > 0) {
      console.error(`   Missing required env vars: ${errors.missing.join(", ")}`);
    }
    for (const suggestion of errors.suggestions) {
      console.warn(`   ${suggestion}`);
    }
  }
}

export function getConfig(): Config {
  validateConfig();

  const config: Config = {
    app: {
      port: Number(process.env.PORT ?? 8787),
      databasePath: process.env.SQLITE_PATH ?? "./data/moon.sqlite",
      jwtSecret: process.env.JWT_SECRET || "moon-secret-key-change-in-production",
      isProduction: process.env.NODE_ENV === "production",
    },
    aiProviders: {
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      kimi: process.env.KIMI_API_KEY,
      minimax: process.env.MINIMAX_API_KEY,
      qwen: process.env.QWEN_API_KEY,
      deepseek: process.env.DEEPSEEK_API_KEY,
    },
  };

  // SMTP configuration for email reminders
  if (process.env.SMTP_HOST) {
    config.smtp = {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
      from: process.env.SMTP_FROM ?? "noreply@moon.ai",
    };
  }

  return config;
}

// Validate at startup
getConfig();
