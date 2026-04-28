import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { routeAIRequest, getConfiguredProviders, getModelsForTier, type AIRequest } from "./ai/router";
import { recordUsage, getUserUsageLimits, recordUsageEvent, hasQuota, getExpirationWarning, isSubscriptionExpired, isOnFreeTrial, getFreeTrialMessage, updateApiKeyLastUsed, getAllUsageStats, getQuotaWarning, type QuotaWarning } from "./ai/cost";
import { DEFAULT_MODELS, MODEL_CONFIGS } from "./ai/models";
import { getConfig } from "./config";
import { sendSubscriptionActivationEmail } from "./ai/email";

const config = getConfig();
const JWT_SECRET = config.app.jwtSecret;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
let compiledStyles = "";

try {
  compiledStyles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf-8");
} catch {
  compiledStyles = "";
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return 'moon_sk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hashApiKey(key: string): string {
  // Store base64 encoded key (for demo - in production use proper encrypted storage)
  return btoa(key);
}

function verifyApiKeyHash(key: string, hash: string): boolean {
  return btoa(key) === hash;
}

function getApiKeyFromHash(hash: string): string {
  // Decode stored key
  return atob(hash);
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

interface PasswordStrength {
  isValid: boolean;
  errors: string[];
}

function checkPasswordStrength(password: string): PasswordStrength {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push("至少8个字符");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("需包含小写字母");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("需包含大写字母");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("需包含数字");
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("需包含特殊字符");
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function createToken(userId: string, email: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    email,
    iat: Date.now(),
    exp: Date.now() + SESSION_DURATION_MS,
  };
  const secret = new TextEncoder().encode(JWT_SECRET);

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));

  const signatureInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signatureInput));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

interface TokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

interface Order {
  id: string;
  out_trade_no: string;
  onepay_id: string | null;
  user_id: string | null;
  plan: string;
  billing_cycle: string;
  fee: number;
  email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const planPrices: Record<string, number> = {
  "入门": 990,
  "普通": 3900,
  "高级": 9900,
};

// Yearly prices (20% discount)
const planPricesYearly: Record<string, number> = {
  "入门": Math.round(990 * 12 * 0.8),
  "普通": Math.round(3900 * 12 * 0.8),
  "高级": Math.round(9900 * 12 * 0.8),
};

async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const secret = new TextEncoder().encode(JWT_SECRET);

    const signatureInput = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
      "raw",
      secret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")), c =>
      c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(signatureInput));
    if (!valid) return null;

    const payload: TokenPayload = JSON.parse(atob(payloadB64));
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

async function getUserFromToken(token: string | undefined): Promise<{ id: string; email: string } | null> {
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  return { id: payload.sub, email: payload.email };
}

function parseSessionCookie(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/session=([^;]+)/);
  return match ? match[1] : undefined;
}

const plans = [
  {
    name: "入门",
    price: "¥9.9",
    fullMoon: "30 次 / 天",
    halfMoon: "200 次 / 天",
    newMoon: "不限",
  },
  {
    name: "普通",
    price: "¥39",
    fullMoon: "200 次 / 天",
    halfMoon: "1000 次 / 天",
    newMoon: "不限",
  },
  {
    name: "高级",
    price: "¥99",
    fullMoon: "1000 次 / 天",
    halfMoon: "5000 次 / 天",
    newMoon: "不限",
  },
] as const;

const modelTiers = [
  {
    tier: "🌕",
    models: ["GPT", "Gemini", "Claude"],
    rule: "优先路由，额度按日计算",
  },
  {
    tier: "🌓",
    models: ["Kimi", "MiniMax", "Qwen"],
    rule: "额度耗尽后降级",
  },
  {
    tier: "🌑",
    models: ["轻量模型", "快速模型", "低成本模型"],
    rule: "始终可用",
  },
] as const;

function orderPage(planName: string, outTradeNo: string, fee: number, billingCycle: string) {
  const cycleLabel = billingCycle === 'yearly' ? '年度' : '月度';
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-4xl mb-4">💰</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">确认订单</h1>
        <p class="text-[#a0937d] mt-2">即将跳转至支付</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
        <div class="space-y-4">
          <div class="flex justify-between text-[#a0937d] text-sm">
            <span>订单号</span>
            <span class="text-[#f5f5dc]">${outTradeNo}</span>
          </div>
          <div class="flex justify-between text-[#a0937d] text-sm">
            <span>套餐</span>
            <span class="text-[#f5f5dc]">${planName}</span>
          </div>
          <div class="flex justify-between text-[#a0937d] text-sm">
            <span>周期</span>
            <span class="text-[#f5f5dc]">${cycleLabel}</span>
          </div>
          <div class="flex justify-between text-[#a0937d] text-sm">
            <span>金额</span>
            <span class="text-[#f5f5dc] text-xl font-bold">¥${(fee / 100).toFixed(2)}</span>
          </div>
          <div class="border-t border-[#3d2f1f] pt-4">
            <button id="payBtn" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8]">正在唤起支付...</button>
          </div>
        </div>
      </div>
    </main>

    ${footer()}

    <script src="https://cdn.onepay.so/wallet.js"></script>
    <script>
      OnePay.createPayment({
        out_trade_no: "${outTradeNo}",
        amount: ${fee},
        description: "MOON ${planName} 套餐",
        success_url: window.location.origin + "/order/success?trade_no=${outTradeNo}",
        cancel_url: window.location.origin + "/order/cancel?trade_no=${outTradeNo}",
      }).then(function(result) {
        if (result.error) {
          document.getElementById("payBtn").textContent = "支付失败，点击重试";
          document.getElementById("payBtn").onclick = function() { location.reload(); };
        } else {
          document.getElementById("payBtn").textContent = "✅ 支付成功";
          document.getElementById("payBtn").disabled = true;
          setTimeout(function() { window.location.href = result.payment_url || "/order/success?trade_no=${outTradeNo}"; }, 500);
        }
      }).catch(function() {
        document.getElementById("payBtn").textContent = "支付失败，点击重试";
        document.getElementById("payBtn").onclick = function() { location.reload(); };
      });
    </script>
  `);
}

function orderSuccessPage(outTradeNo: string, planName: string = '', billingCycle: string = '') {
  const cycleLabel = billingCycle === 'yearly' ? '年度' : '月度';
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-6xl mb-4">🎉</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">支付成功！</h1>
        <p class="text-[#f5f5dc] mt-2 font-medium">您的订阅已成功激活</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 text-center">
        ${planName ? `
        <div class="mb-6 p-4 bg-[#2d241c] rounded-xl">
          <div class="text-[#7a6f5d] text-sm mb-1">开通套餐</div>
          <div class="text-[#f5f5dc] text-xl font-bold">${planName} · ${cycleLabel}</div>
        </div>
        ` : ''}
        <div class="space-y-2 text-left mb-6">
          <div class="flex items-center gap-3 text-[#a0937d] text-sm">
            <span class="text-green-400">✓</span> 订阅已激活，可立即使用
          </div>
          <div class="flex items-center gap-3 text-[#a0937d] text-sm">
            <span class="text-green-400">✓</span> 额度已添加到您的账户
          </div>
          <div class="flex items-center gap-3 text-[#a0937d] text-sm">
            <span class="text-green-400">✓</span> 激活通知已发送至邮箱
          </div>
        </div>
        <p class="text-[#7a6f5d] text-sm mb-4">订单号：${outTradeNo}</p>
        <a href="/dashboard" class="inline-block bg-[#f5f5dc] text-black px-8 py-3 rounded-full font-medium hover:bg-[#d4c4a8]">前往使用 →</a>
      </div>
    </main>

    ${footer()}
  `);
}

function orderCancelPage(outTradeNo: string) {
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-6xl mb-4">❌</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">支付取消</h1>
        <p class="text-[#a0937d] mt-2">您已取消支付</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 text-center">
        <p class="text-[#a0937d] text-sm mb-6">订单号：${outTradeNo}</p>
        <a href="/pricing" class="inline-block border border-[#f5f5dc] text-[#f5f5dc] px-6 py-3 rounded-full font-medium hover:bg-[#f5f5dc] hover:text-black">重新选择套餐</a>
      </div>
    </main>

    ${footer()}
  `);
}

function ordersPage(email: string, orders: Order[]) {
  const ordersHtml = orders.length === 0
    ? '<p class="text-[#7a6f5d] text-sm">暂无订单</p>'
    : orders.map(order => `
      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 mb-4">
        <div class="flex justify-between items-start mb-3">
          <div>
            <div class="text-[#f5f5dc] font-medium">${order.plan}</div>
            <div class="text-[#7a6f5d] text-xs mt-1">订单号：${order.out_trade_no}</div>
          </div>
          <span class="px-3 py-1 rounded-full text-xs ${
            order.status === 'paid' ? 'bg-green-900/30 text-green-200' :
            order.status === 'pending' ? 'bg-yellow-900/30 text-yellow-200' :
            order.status === 'cancelled' ? 'bg-red-900/30 text-red-200' :
            'bg-gray-900/30 text-gray-200'
          }">${
            order.status === 'paid' ? '已支付' :
            order.status === 'pending' ? '待支付' :
            order.status === 'cancelled' ? '已取消' :
            order.status
          }</span>
        </div>
        <div class="flex justify-between text-[#a0937d] text-sm">
          <span>${order.created_at}</span>
          <span class="text-[#f5f5dc] font-bold">¥${(order.fee / 100).toFixed(2)}</span>
        </div>
      </div>
    `).join('');

  return baseHtml(`
    ${navbar('/orders')}

    <main class="max-w-3xl mx-auto px-4 py-12">
      <div class="mb-8 flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold text-[#f5f5dc]">订单历史 📝</h1>
          <p class="text-[#a0937d]">${email}</p>
        </div>
        <a href="/dashboard" class="text-[#a0937d] hover:text-[#f5f5dc] text-sm">← 返回后台</a>
      </div>

      <div>
        ${ordersHtml}
      </div>
    </main>

    ${footer()}
  `);
}

function selectPlanPage() {
  return baseHtml(`
    ${navbar('/order/select')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <div class="text-center mb-12">
        <div class="text-4xl mb-4">💰</div>
        <h1 class="text-3xl font-bold text-[#f5f5dc] mb-2">选择套餐</h1>
        <p class="text-[#a0937d]">选择适合你的使用量</p>
      </div>

      <!-- Billing Cycle Toggle -->
      <div class="flex justify-center mb-8">
        <div class="inline-flex rounded-full bg-[#1a1410] border border-[#3d2f1f] p-1">
          <button type="button" id="cycleMonthly" onclick="setBillingCycle('monthly')" class="px-6 py-2 rounded-full text-sm font-medium transition-all bg-[#f5f5dc] text-black">月度</button>
          <button type="button" id="cycleYearly" onclick="setBillingCycle('yearly')" class="px-6 py-2 rounded-full text-sm font-medium transition-all text-[#a0937d] hover:text-[#f5f5dc]">年度 <span class="text-green-400 text-xs">8折</span></button>
        </div>
      </div>

      <!-- Confirmation Modal -->
      <div id="confirmModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 hidden flex items-center justify-center">
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-8 max-w-md mx-4">
          <h3 class="text-xl font-bold text-[#f5f5dc] mb-4">确认订单</h3>
          <div id="confirmDetails" class="text-[#a0937d] text-sm mb-6 space-y-2"></div>
          <div class="flex gap-4">
            <button onclick="closeConfirmModal()" class="flex-1 border border-[#3d2f1f] text-[#f5f5dc] px-6 py-3 rounded-full font-medium hover:bg-[#2d241c]">取消</button>
            <button id="confirmBtn" class="flex-1 bg-[#f5f5dc] text-black px-6 py-3 rounded-full font-medium hover:bg-[#d4c4a8]">确认支付</button>
          </div>
        </div>
      </div>

      <div class="grid md:grid-cols-3 gap-6">
        ${plans.map((plan, i) => `
          <div class="bg-[#1a1410] border ${i === 1 ? 'border-[#f5f5dc] ring-1 ring-[#f5f5dc]' : 'border-[#3d2f1f]'} rounded-2xl p-8 text-center">
            ${i === 1 ? '<div class="text-[#f5f5dc] text-xs font-medium mb-2">推荐</div>' : ''}
            <h2 class="text-[#f5f5dc] text-xl font-bold mb-4">${plan.name}</h2>
            <div class="text-[#f5f5dc] text-4xl font-bold mb-1"><span id="price-${plan.name}">${plan.price}</span></div>
            <div id="price-note-${plan.name}" class="text-[#a0937d] text-sm mb-2"></div>
            <div id="discount-tag-${plan.name}" class="hidden mb-4">
              <span class="inline-block bg-green-900/40 text-green-300 px-3 py-1 rounded-full text-sm">🎉 年付7.2折起</span>
            </div>
            <ul class="text-left text-[#a0937d] text-sm space-y-3 mb-8">
              <li class="flex items-center gap-2"><span>🌕</span> ${plan.fullMoon}</li>
              <li class="flex items-center gap-2"><span>🌓</span> ${plan.halfMoon}</li>
              <li class="flex items-center gap-2"><span>🌑</span> ${plan.newMoon}</li>
              <li class="flex items-center gap-2"><span>✓</span> 自动路由切换</li>
              ${i === 2 ? '<li class="flex items-center gap-2"><span>✓</span> 长上下文</li><li class="flex items-center gap-2"><span>✓</span> 高优先级</li>' : ''}
            </ul>
            <form method="POST" action="/order/create" id="form-${plan.name}">
              <input type="hidden" name="plan" value="${plan.name}" />
              <input type="hidden" name="billing_cycle" id="billing_cycle-${plan.name}" value="monthly" />
              <button type="button" onclick="showConfirm('${plan.name}')" class="block w-full ${i === 1 ? 'bg-[#f5f5dc] text-black' : 'border border-[#f5f5dc] text-[#f5f5dc]'} px-6 py-3 rounded-full font-medium hover:opacity-90">立即开通</button>
            </form>
          </div>
        `).join('')}
      </div>
    </main>

    ${footer()}

    <script>
      const yearlyPrices = {
        "入门": ${Math.round(990 * 12 * 0.8)},
        "普通": ${Math.round(3900 * 12 * 0.8)},
        "高级": ${Math.round(9900 * 12 * 0.8)},
      };
      const monthlyPrices = {
        "入门": 990,
        "普通": 3900,
        "高级": 9900,
      };
      let currentCycle = 'monthly';

      function setBillingCycle(cycle) {
        currentCycle = cycle;
        document.getElementById('cycleMonthly').className = cycle === 'monthly' ? 'px-6 py-2 rounded-full text-sm font-medium transition-all bg-[#f5f5dc] text-black' : 'px-6 py-2 rounded-full text-sm font-medium transition-all text-[#a0937d] hover:text-[#f5f5dc]';
        document.getElementById('cycleYearly').className = cycle === 'yearly' ? 'px-6 py-2 rounded-full text-sm font-medium transition-all bg-[#f5f5dc] text-black' : 'px-6 py-2 rounded-full text-sm font-medium transition-all text-[#a0937d] hover:text-[#f5f5dc]';

        ['入门', '普通', '高级'].forEach(function(planName) {
          var price = cycle === 'yearly' ? yearlyPrices[planName] : monthlyPrices[planName];
          document.getElementById('price-' + planName).textContent = '¥' + (price / 100).toFixed(0);
          document.getElementById('price-note-' + planName).textContent = cycle === 'yearly' ? '相当于 ¥' + (price / 12 / 100).toFixed(0) + '/月' : '';
          document.getElementById('billing_cycle-' + planName).value = cycle;
          document.getElementById('discount-tag-' + planName).className = cycle === 'yearly' ? 'mb-4' : 'hidden mb-4';
        });
      }

      function showConfirm(planName) {
        var price = currentCycle === 'yearly' ? yearlyPrices[planName] : monthlyPrices[planName];
        var cycleLabel = currentCycle === 'yearly' ? '年度' : '月度';
        var monthlyEquivalent = currentCycle === 'yearly' ? '（相当于 ¥' + (price / 12 / 100).toFixed(0) + '/月）' : '';

        document.getElementById('confirmDetails').innerHTML =
          '<div><span class="text-[#7a6f5d]">套餐：</span><span class="text-[#f5f5dc]">' + planName + '</span></div>' +
          '<div><span class="text-[#7a6f5d]">周期：</span><span class="text-[#f5f5dc]">' + cycleLabel + '</span></div>' +
          '<div><span class="text-[#7a6f5d]">金额：</span><span class="text-[#f5f5dc] text-xl font-bold">¥' + (price / 100).toFixed(2) + '</span>' + monthlyEquivalent + '</div>';

        document.getElementById('confirmBtn').onclick = function() {
          document.getElementById('form-' + planName).submit();
        };

        document.getElementById('confirmModal').classList.remove('hidden');
      }

      function closeConfirmModal() {
        document.getElementById('confirmModal').classList.add('hidden');
      }

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !document.getElementById('confirmModal').classList.contains('hidden')) {
          closeConfirmModal();
        }
      });
    </script>
  `);
}

const app = new Hono();

app.get("/styles.css", (c) => {
  c.header("Content-Type", "text/css; charset=utf-8");
  return c.text(
    compiledStyles ||
      "body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#000;color:#f5f5dc;}"
  );
});

function baseHtml(content: string) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="coffee">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MOON | Model Always Online</title>
    <link rel="stylesheet" href="/styles.css" />
    <style>
      html { box-sizing: border-box; }
      *, *::before, *::after { box-sizing: inherit; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    </style>
  </head>
  <body class="bg-black text-[#f5f5dc] min-h-screen">
    ${content}
  </body>
</html>`;
}

function navbar(currentPath: string = "/") {
  return `
  <nav class="border-b border-[#3d2f1f] px-4 py-4">
    <div class="max-w-5xl mx-auto flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 text-[#f5f5dc] hover:text-[#f5f5dc]">
        <span class="text-2xl">🌙</span>
        <span class="font-bold text-lg">MOON</span>
      </a>
      <div class="flex items-center gap-6 text-sm">
        <a href="/" class="hover:text-[#d4c4a8] ${currentPath === '/' ? 'text-[#f5f5dc] font-semibold' : 'text-[#a0937d]'}">首页</a>
        <a href="/pricing" class="hover:text-[#d4c4a8] ${currentPath === '/pricing' ? 'text-[#f5f5dc] font-semibold' : 'text-[#a0937d]'}">套餐</a>
        <a href="/docs" class="hover:text-[#d4c4a8] ${currentPath === '/docs' ? 'text-[#f5f5dc] font-semibold' : 'text-[#a0937d]'}">API 文档</a>
        <a href="/login" class="text-[#a0937d] hover:text-[#f5f5dc]">登录</a>
        <a href="/register" class="bg-[#f5f5dc] text-black px-4 py-2 rounded-full text-sm font-medium hover:bg-[#d4c4a8]">注册</a>
      </div>
    </div>
  </nav>`;
}

function footer() {
  return `
  <footer class="border-t border-[#3d2f1f] px-4 py-8 mt-16">
    <div class="max-w-5xl mx-auto text-center text-[#a0937d] text-sm">
      <p class="text-2xl mb-2">🌙</p>
      <p>MOON — Model Always Online</p>
    </div>
  </footer>`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function loginPageWithError(error: string) {
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-4xl mb-4">🌙</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">登录 MOON</h1>
        <p class="text-[#a0937d] mt-2">欢迎回来</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
        <div id="errorBox" class="bg-red-900/30 border border-red-800 text-red-200 rounded-lg px-4 py-3 mb-4 text-sm">${error}</div>
        <form id="loginForm" method="POST" action="/login" class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" name="email" id="emailInput" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
            <div id="emailError" class="text-red-400 text-xs mt-1 hidden"></div>
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" name="password" id="passwordInput" placeholder="••••••••" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
            <div id="passwordError" class="text-red-400 text-xs mt-1 hidden"></div>
          </div>
          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 text-[#a0937d] text-sm cursor-pointer">
              <input type="checkbox" name="remember" id="rememberInput" class="w-4 h-4 rounded border-[#3d2f1f] bg-black checked:bg-[#f5f5dc] checked:border-[#f5f5dc]" />
              <span>记住我</span>
            </label>
          </div>
          <button type="submit" id="submitBtn" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <span id="btnText">登录</span>
            <svg id="loadingSpinner" class="animate-spin hidden w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </button>
        </form>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          还没有账号？<a href="/register" class="text-[#f5f5dc] hover:underline">立即注册</a>
        </div>
      </div>
    </main>

    ${footer()}

    <script>
      (function() {
        var form = document.getElementById('loginForm');
        var submitBtn = document.getElementById('submitBtn');
        var emailInput = document.getElementById('emailInput');
        var passwordInput = document.getElementById('passwordInput');
        var emailError = document.getElementById('emailError');
        var passwordError = document.getElementById('passwordError');
        var errorBox = document.getElementById('errorBox');
        var btnText = document.getElementById('btnText');
        var loadingSpinner = document.getElementById('loadingSpinner');

        function isValidEmail(email) {
          return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
        }

        function showError(element, message) {
          element.textContent = message;
          element.classList.remove('hidden');
        }

        function hideError(element) {
          element.classList.add('hidden');
        }

        function setInputError(input, hasError) {
          input.classList.toggle('border-red-500', hasError);
          input.classList.toggle('border-[#3d2f1f]', !hasError);
        }

        emailInput.addEventListener('blur', function() {
          if (emailInput.value && !isValidEmail(emailInput.value)) {
            showError(emailError, '请输入有效的邮箱地址');
            setInputError(emailInput, true);
          } else {
            hideError(emailError);
            setInputError(emailInput, false);
          }
        });

        emailInput.addEventListener('input', function() {
          if (isValidEmail(emailInput.value)) {
            hideError(emailError);
            setInputError(emailInput, false);
          }
        });

        passwordInput.addEventListener('input', function() {
          hideError(passwordError);
          setInputError(passwordInput, false);
        });

        form.addEventListener('submit', function(e) {
          var email = emailInput.value.trim();
          var password = passwordInput.value;
          var hasError = false;

          errorBox.classList.add('hidden');

          if (!email) {
            showError(emailError, '请填写邮箱');
            setInputError(emailInput, true);
            hasError = true;
          } else if (!isValidEmail(email)) {
            showError(emailError, '请输入有效的邮箱地址');
            setInputError(emailInput, true);
            hasError = true;
          }

          if (!password) {
            showError(passwordError, '请填写密码');
            setInputError(passwordInput, true);
            hasError = true;
          }

          if (hasError) {
            e.preventDefault();
            return;
          }

          submitBtn.disabled = true;
          btnText.textContent = '登录中...';
          loadingSpinner.classList.remove('hidden');
        });
      })();
    </script>
  `);
}

function registerPageWithError(error: string) {
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-4xl mb-4">🌙</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">注册 MOON</h1>
        <p class="text-[#a0937d] mt-2">创建账号，开始使用</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
        <div class="bg-red-900/30 border border-red-800 text-red-200 rounded-lg px-4 py-3 mb-4 text-sm">
          ${error}
        </div>
        <form method="POST" action="/register" class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" name="email" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" name="password" placeholder="设置密码" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <button type="submit" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8]">注册</button>
        </form>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          已有账号？<a href="/login" class="text-[#f5f5dc] hover:underline">立即登录</a>
        </div>
      </div>
    </main>

    ${footer()}
  `);
}

function moonPage() {
  return baseHtml(`
    ${navbar('/')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <!-- Hero -->
      <section class="text-center py-16">
        <div class="text-6xl mb-6">🌙</div>
        <h1 class="text-4xl md:text-5xl font-bold text-[#f5f5dc] mb-4 tracking-tight">
          大模型一直在线
        </h1>
        <p class="text-[#a0937d] text-lg mb-2">🌕 / 🌓 / 🌑</p>
        <p class="text-[#7a6f5d] max-w-xl mx-auto mb-8">
          优先使用 🌕，其次 🌓，🌑 不限。自动路由，始终在线。
        </p>
        <div class="flex gap-4 justify-center">
          <a href="/register" class="bg-[#f5f5dc] text-black px-6 py-3 rounded-full font-medium hover:bg-[#d4c4a8]">立即开始</a>
          <a href="/pricing" class="border border-[#f5f5dc] text-[#f5f5dc] px-6 py-3 rounded-full font-medium hover:bg-[#f5f5dc] hover:text-black">查看套餐</a>
        </div>
      </section>

      <!-- Tiers -->
      <section class="py-12">
        <h2 class="text-center text-[#f5f5dc] text-2xl font-bold mb-8">三层路由</h2>
        <div class="grid md:grid-cols-3 gap-6">
          ${modelTiers.map(tier => `
            <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 text-center">
              <h3 class="text-[#f5f5dc] text-xl font-bold mb-2">${tier.tier}</h3>
              <div class="text-[#a0937d] text-sm mb-3">${tier.models.join(' / ')}</div>
              <p class="text-[#7a6f5d] text-xs">${tier.rule}</p>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- How it works -->
      <section class="py-12">
        <h2 class="text-center text-[#f5f5dc] text-2xl font-bold mb-8">工作原理 ⚡</h2>
        <div class="grid md:grid-cols-2 gap-6">
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="text-2xl mb-3">🌕</div>
            <p class="text-[#a0937d] text-sm">复杂任务、编程、长文写作使用 GPT、Gemini、Claude 等顶级模型。</p>
          </div>
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="text-2xl mb-3">🌓</div>
            <p class="text-[#a0937d] text-sm">日常任务、总结、改写、翻译使用 Kimi、MiniMax、Qwen 等高效模型。</p>
          </div>
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 md:col-span-2">
            <div class="text-2xl mb-3">🌑</div>
            <p class="text-[#a0937d] text-sm">聊天、续写、润色等基础任务使用轻量快速模型，🌑 时段不限量使用。</p>
          </div>
        </div>
      </section>

      <!-- Pricing preview -->
      <section class="py-12 text-center">
        <h2 class="text-[#f5f5dc] text-2xl font-bold mb-2">简单定价 💰</h2>
        <p class="text-[#a0937d] mb-8">选择适合你的套餐</p>
        <div class="grid md:grid-cols-3 gap-6 text-left">
          ${plans.map((plan, i) => `
            <div class="bg-[#1a1410] border ${i === 1 ? 'border-[#f5f5dc]' : 'border-[#3d2f1f]'} rounded-2xl p-6 ${i === 1 ? 'ring-1 ring-[#f5f5dc]' : ''}">
              <div class="text-[#a0937d] text-sm mb-1">${plan.name}</div>
              <div class="text-[#f5f5dc] text-3xl font-bold mb-1">${plan.price}</div>
              <ul class="text-[#a0937d] text-xs space-y-1 mt-4">
                <li>🌕 ${plan.fullMoon}</li>
                <li>🌓 ${plan.halfMoon}</li>
                <li>🌑 ${plan.newMoon}</li>
              </ul>
            </div>
          `).join('')}
        </div>
        <a href="/pricing" class="inline-block mt-8 text-[#f5f5dc] hover:underline">查看全部套餐 →</a>
      </section>
    </main>

    ${footer()}
  `);
}

function pricingPage() {
  return baseHtml(`
    ${navbar('/pricing')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <div class="text-center mb-12">
        <div class="text-4xl mb-4">💰</div>
        <h1 class="text-3xl font-bold text-[#f5f5dc] mb-2">套餐定价</h1>
        <p class="text-[#a0937d]">选择适合你的使用量</p>
      </div>

      <div class="grid md:grid-cols-3 gap-6">
        ${plans.map((plan, i) => `
          <div class="bg-[#1a1410] border ${i === 1 ? 'border-[#f5f5dc] ring-1 ring-[#f5f5dc]' : 'border-[#3d2f1f]'} rounded-2xl p-8 text-center">
            ${i === 1 ? '<div class="text-[#f5f5dc] text-xs font-medium mb-2">推荐</div>' : ''}
            <h2 class="text-[#f5f5dc] text-xl font-bold mb-4">${plan.name}</h2>
            <div class="text-[#f5f5dc] text-4xl font-bold mb-1">${plan.price}</div>
            <div class="text-[#a0937d] text-sm mb-6"></div>
            <ul class="text-left text-[#a0937d] text-sm space-y-3 mb-8">
              <li class="flex items-center gap-2"><span>🌕</span> ${plan.fullMoon}</li>
              <li class="flex items-center gap-2"><span>🌓</span> ${plan.halfMoon}</li>
              <li class="flex items-center gap-2"><span>🌑</span> ${plan.newMoon}</li>
              <li class="flex items-center gap-2"><span>✓</span> 自动路由切换</li>
              ${i === 2 ? '<li class="flex items-center gap-2"><span>✓</span> 长上下文</li><li class="flex items-center gap-2"><span>✓</span> 高优先级</li>' : ''}
            </ul>
            <a href="/register" class="block w-full ${i === 1 ? 'bg-[#f5f5dc] text-black' : 'border border-[#f5f5dc] text-[#f5f5dc]'} px-6 py-3 rounded-full font-medium hover:opacity-90">立即开通</a>
          </div>
        `).join('')}
      </div>

      <div class="mt-12 text-center text-[#7a6f5d] text-sm">
        <p>🌙 所有套餐均支持随时升级或降级</p>
      </div>
    </main>

    ${footer()}
  `);
}

function loginPage() {
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-4xl mb-4">🌙</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">登录 MOON</h1>
        <p class="text-[#a0937d] mt-2">欢迎回来</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
        <div id="errorBox" class="bg-red-900/30 border border-red-800 text-red-200 rounded-lg px-4 py-3 mb-4 text-sm hidden"></div>
        <form id="loginForm" method="POST" action="/login" class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" name="email" id="emailInput" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
            <div id="emailError" class="text-red-400 text-xs mt-1 hidden"></div>
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" name="password" id="passwordInput" placeholder="••••••••" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
            <div id="passwordError" class="text-red-400 text-xs mt-1 hidden"></div>
          </div>
          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 text-[#a0937d] text-sm cursor-pointer">
              <input type="checkbox" name="remember" id="rememberInput" class="w-4 h-4 rounded border-[#3d2f1f] bg-black checked:bg-[#f5f5dc] checked:border-[#f5f5dc]" />
              <span>记住我</span>
            </label>
          </div>
          <button type="submit" id="submitBtn" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <span id="btnText">登录</span>
            <svg id="loadingSpinner" class="animate-spin hidden w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </button>
        </form>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          还没有账号？<a href="/register" class="text-[#f5f5dc] hover:underline">立即注册</a>
        </div>
      </div>
    </main>

    ${footer()}

    <script>
      (function() {
        var form = document.getElementById('loginForm');
        var submitBtn = document.getElementById('submitBtn');
        var emailInput = document.getElementById('emailInput');
        var passwordInput = document.getElementById('passwordInput');
        var rememberInput = document.getElementById('rememberInput');
        var emailError = document.getElementById('emailError');
        var passwordError = document.getElementById('passwordError');
        var errorBox = document.getElementById('errorBox');
        var btnText = document.getElementById('btnText');
        var loadingSpinner = document.getElementById('loadingSpinner');

        function isValidEmail(email) {
          return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
        }

        function showError(element, message) {
          element.textContent = message;
          element.classList.remove('hidden');
        }

        function hideError(element) {
          element.classList.add('hidden');
        }

        function setInputError(input, hasError) {
          input.classList.toggle('border-red-500', hasError);
          input.classList.toggle('border-[#3d2f1f]', !hasError);
        }

        emailInput.addEventListener('blur', function() {
          if (emailInput.value && !isValidEmail(emailInput.value)) {
            showError(emailError, '请输入有效的邮箱地址');
            setInputError(emailInput, true);
          } else {
            hideError(emailError);
            setInputError(emailInput, false);
          }
        });

        emailInput.addEventListener('input', function() {
          if (isValidEmail(emailInput.value)) {
            hideError(emailError);
            setInputError(emailInput, false);
          }
        });

        passwordInput.addEventListener('input', function() {
          hideError(passwordError);
          setInputError(passwordInput, false);
        });

        form.addEventListener('submit', function(e) {
          var email = emailInput.value.trim();
          var password = passwordInput.value;
          var hasError = false;

          errorBox.classList.add('hidden');

          if (!email) {
            showError(emailError, '请填写邮箱');
            setInputError(emailInput, true);
            hasError = true;
          } else if (!isValidEmail(email)) {
            showError(emailError, '请输入有效的邮箱地址');
            setInputError(emailInput, true);
            hasError = true;
          }

          if (!password) {
            showError(passwordError, '请填写密码');
            setInputError(passwordInput, true);
            hasError = true;
          }

          if (hasError) {
            e.preventDefault();
            return;
          }

          submitBtn.disabled = true;
          btnText.textContent = '登录中...';
          loadingSpinner.classList.remove('hidden');
        });
      })();
    </script>
  `);
}

function registerPage() {
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-4xl mb-4">🌙</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">注册 MOON</h1>
        <p class="text-[#a0937d] mt-2">创建账号，开始使用</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
        <div id="errorBox" class="bg-red-900/30 border border-red-800 text-red-200 rounded-lg px-4 py-3 mb-4 text-sm hidden"></div>
        <form id="registerForm" method="POST" action="/register" class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" name="email" id="emailInput" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
            <div id="emailError" class="text-red-400 text-xs mt-1 hidden"></div>
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" name="password" id="passwordInput" placeholder="设置密码" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
            <div id="passwordError" class="text-red-400 text-xs mt-1 hidden"></div>
            <div class="text-[#7a6f5d] text-xs mt-1">至少8个字符，需包含数字、字母和特殊字符</div>
          </div>
          <button type="submit" id="submitBtn" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <span id="btnText">注册</span>
            <svg id="loadingSpinner" class="animate-spin hidden w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </button>
        </form>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          已有账号？<a href="/login" class="text-[#f5f5dc] hover:underline">立即登录</a>
        </div>
      </div>
    </main>

    ${footer()}

    <script>
      (function() {
        var form = document.getElementById('registerForm');
        var submitBtn = document.getElementById('submitBtn');
        var emailInput = document.getElementById('emailInput');
        var passwordInput = document.getElementById('passwordInput');
        var emailError = document.getElementById('emailError');
        var passwordError = document.getElementById('passwordError');
        var errorBox = document.getElementById('errorBox');
        var btnText = document.getElementById('btnText');
        var loadingSpinner = document.getElementById('loadingSpinner');

        function isValidEmail(email) {
          return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
        }

        function showError(element, message) {
          element.textContent = message;
          element.classList.remove('hidden');
        }

        function hideError(element) {
          element.classList.add('hidden');
        }

        function setInputError(input, hasError) {
          input.classList.toggle('border-red-500', hasError);
          input.classList.toggle('border-[#3d2f1f]', !hasError);
        }

        emailInput.addEventListener('blur', function() {
          if (emailInput.value && !isValidEmail(emailInput.value)) {
            showError(emailError, '请输入有效的邮箱地址');
            setInputError(emailInput, true);
          } else {
            hideError(emailError);
            setInputError(emailInput, false);
          }
        });

        emailInput.addEventListener('input', function() {
          if (isValidEmail(emailInput.value)) {
            hideError(emailError);
            setInputError(emailInput, false);
          }
        });

        passwordInput.addEventListener('blur', function() {
          if (!passwordInput.value) return;
          var strength = checkPasswordStrengthJS(passwordInput.value);
          if (!strength.isValid) {
            showError(passwordError, strength.errors[0]);
            setInputError(passwordInput, true);
          } else {
            hideError(passwordError);
            setInputError(passwordInput, false);
          }
        });

        passwordInput.addEventListener('input', function() {
          if (passwordInput.value.length >= 8) {
            var strength = checkPasswordStrengthJS(passwordInput.value);
            if (strength.isValid) {
              hideError(passwordError);
              setInputError(passwordInput, false);
            }
          }
        });

        function checkPasswordStrengthJS(pwd) {
          var errors = [];
          if (pwd.length < 8) errors.push("至少8个字符");
          if (!/[a-z]/.test(pwd)) errors.push("需包含小写字母");
          if (!/[A-Z]/.test(pwd)) errors.push("需包含大写字母");
          if (!/[0-9]/.test(pwd)) errors.push("需包含数字");
          if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) errors.push("需包含特殊字符");
          return { isValid: errors.length === 0, errors: errors };
        }

        form.addEventListener('submit', function(e) {
          var email = emailInput.value.trim();
          var password = passwordInput.value;
          var hasError = false;

          errorBox.classList.add('hidden');

          if (!email) {
            showError(emailError, '请填写邮箱');
            setInputError(emailInput, true);
            hasError = true;
          } else if (!isValidEmail(email)) {
            showError(emailError, '请输入有效的邮箱地址');
            setInputError(emailInput, true);
            hasError = true;
          }

          if (!password) {
            showError(passwordError, '请填写密码');
            setInputError(passwordInput, true);
            hasError = true;
          } else {
            var strength = checkPasswordStrengthJS(password);
            if (!strength.isValid) {
              showError(passwordError, '密码不符合要求：' + strength.errors.join('、'));
              setInputError(passwordInput, true);
              hasError = true;
            }
          }

          if (hasError) {
            e.preventDefault();
            return;
          }

          submitBtn.disabled = true;
          btnText.textContent = '注册中...';
          loadingSpinner.classList.remove('hidden');
        });
      })();
    </script>
  `);
}

function dashboardPage(
  email: string,
  subscription: { plan: string; status: string; expires_at?: string | null } | undefined,
  usage: { fullMoon: { limit: number; used: number }; halfMoon: { limit: number; used: number }; newMoon: { limit: number; used: number } },
  apiKey: string,
  expirationWarning: string | null,
  usageStats?: { today: { fullMoon: number; halfMoon: number; newMoon: number }; week: { fullMoon: number; halfMoon: number; newMoon: number }; month: { fullMoon: number; halfMoon: number; newMoon: number } },
  quotaWarnings?: QuotaWarning[]
) {
  const planData = plans.find(p => p.name === subscription?.plan);
  const planName = planData?.name || "未订阅";
  const planPrice = planData?.price || "-";
  const planIndex = planData ? plans.indexOf(planData) : -1;

  const formatLimit = (n: number) => n === Infinity ? '不限' : n.toString();

  const warningHtml = expirationWarning
    ? `<div class="bg-yellow-900/30 border border-yellow-700 text-yellow-200 rounded-lg px-4 py-3 mb-6 text-sm">⚠️ ${expirationWarning}</div>`
    : '';

  // Generate quota warning HTML
  const quotaWarningsHtml = quotaWarnings && quotaWarnings.length > 0
    ? quotaWarnings.map(w => {
        const bgClass = w.level === 'exceeded' ? 'bg-red-900/30 border-red-700 text-red-200'
          : w.level === 'high' ? 'bg-orange-900/30 border-orange-700 text-orange-200'
          : 'bg-yellow-900/30 border-yellow-700 text-yellow-200';
        return `<div class="${bgClass} border rounded-lg px-4 py-3 text-sm">${w.message}</div>`;
      }).join('')
    : '';

  // Usage section with tabs for today/week/month
  const usageTabsHtml = usageStats
    ? `
      <div class="mb-4 flex gap-2">
        <button class="usage-tab px-3 py-1 rounded text-xs ${'today' === 'today' ? 'bg-[#f5f5dc] text-black' : 'bg-[#2a2018] text-[#a0937d]'}" data-period="today">今日</button>
        <button class="usage-tab px-3 py-1 rounded text-xs ${'today' === 'week' ? 'bg-[#f5f5dc] text-black' : 'bg-[#2a2018] text-[#a0937d]'}" data-period="week">本周</button>
        <button class="usage-tab px-3 py-1 rounded text-xs ${'today' === 'month' ? 'bg-[#f5f5dc] text-black' : 'bg-[#2a2018] text-[#a0937d]'}" data-period="month">本月</button>
      </div>
      <div id="usageContent" class="space-y-3">
        <div class="usage-period" data-period="today">
          <div class="flex justify-between text-[#a0937d] text-sm mb-1">
            <span>🌕</span>
            <span>${usageStats.today.fullMoon} / ${formatLimit(usage.fullMoon.limit)} 次</span>
          </div>
          <div class="h-2 bg-black rounded-full overflow-hidden mb-2">
            <div class="h-full bg-[#f5f5dc] rounded-full" style="width: ${Math.min(100, (usageStats.today.fullMoon / usage.fullMoon.limit) * 100)}%"></div>
          </div>
          <div class="flex justify-between text-[#a0937d] text-sm mb-1">
            <span>🌓</span>
            <span>${usageStats.today.halfMoon} / ${formatLimit(usage.halfMoon.limit)} 次</span>
          </div>
          <div class="h-2 bg-black rounded-full overflow-hidden">
            <div class="h-full bg-[#d4c4a8] rounded-full" style="width: ${Math.min(100, (usageStats.today.halfMoon / usage.halfMoon.limit) * 100)}%"></div>
          </div>
        </div>
        <div class="usage-period hidden" data-period="week">
          <div class="flex justify-between text-[#a0937d] text-sm mb-1">
            <span>🌕</span>
            <span>${usageStats.week.fullMoon} / ${formatLimit(usage.fullMoon.limit)} 次</span>
          </div>
          <div class="h-2 bg-black rounded-full overflow-hidden mb-2">
            <div class="h-full bg-[#f5f5dc] rounded-full" style="width: ${Math.min(100, (usageStats.week.fullMoon / usage.fullMoon.limit) * 100)}%"></div>
          </div>
          <div class="flex justify-between text-[#a0937d] text-sm mb-1">
            <span>🌓</span>
            <span>${usageStats.week.halfMoon} / ${formatLimit(usage.halfMoon.limit)} 次</span>
          </div>
          <div class="h-2 bg-black rounded-full overflow-hidden">
            <div class="h-full bg-[#d4c4a8] rounded-full" style="width: ${Math.min(100, (usageStats.week.halfMoon / usage.halfMoon.limit) * 100)}%"></div>
          </div>
        </div>
        <div class="usage-period hidden" data-period="month">
          <div class="flex justify-between text-[#a0937d] text-sm mb-1">
            <span>🌕</span>
            <span>${usageStats.month.fullMoon} / ${formatLimit(usage.fullMoon.limit)} 次</span>
          </div>
          <div class="h-2 bg-black rounded-full overflow-hidden mb-2">
            <div class="h-full bg-[#f5f5dc] rounded-full" style="width: ${Math.min(100, (usageStats.month.fullMoon / usage.fullMoon.limit) * 100)}%"></div>
          </div>
          <div class="flex justify-between text-[#a0937d] text-sm mb-1">
            <span>🌓</span>
            <span>${usageStats.month.halfMoon} / ${formatLimit(usage.halfMoon.limit)} 次</span>
          </div>
          <div class="h-2 bg-black rounded-full overflow-hidden">
            <div class="h-full bg-[#d4c4a8] rounded-full" style="width: ${Math.min(100, (usageStats.month.halfMoon / usage.halfMoon.limit) * 100)}%"></div>
          </div>
        </div>
      </div>
      <div class="text-[#7a6f5d] text-xs mt-3">🌑 轻量模型不限量</div>
    `
    : `<div class="space-y-3">
        <div>
          <div class="flex justify-between text-[#a0937d] text-sm mb-1">
            <span>🌕</span>
            <span>${usage.fullMoon.used} / ${formatLimit(usage.fullMoon.limit)} 次</span>
          </div>
          <div class="h-2 bg-black rounded-full overflow-hidden">
            <div class="h-full bg-[#f5f5dc] rounded-full" style="width: ${Math.min(100, (usage.fullMoon.used / usage.fullMoon.limit) * 100)}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-[#a0937d] text-sm mb-1">
            <span>🌓</span>
            <span>${usage.halfMoon.used} / ${formatLimit(usage.halfMoon.limit)} 次</span>
          </div>
          <div class="h-2 bg-black rounded-full overflow-hidden">
            <div class="h-full bg-[#d4c4a8] rounded-full" style="width: ${Math.min(100, (usage.halfMoon.used / usage.halfMoon.limit) * 100)}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-[#a0937d] text-sm mb-1">
            <span>🌑</span>
            <span>不限</span>
          </div>
        </div>
      </div>`;

  return baseHtml(`
    ${navbar('/dashboard')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-[#f5f5dc]">用户后台 🌙</h1>
        <p class="text-[#a0937d]">${email}</p>
      </div>

      ${warningHtml}
      ${quotaWarningsHtml ? `<div class="space-y-2 mb-6">${quotaWarningsHtml}</div>` : ''}

      <div class="grid md:grid-cols-2 gap-6">
        <!-- Current Plan -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">当前套餐</h2>
          <div class="text-[#a0937d] text-sm mb-4">${planName}</div>
          <div class="text-[#f5f5dc] text-2xl font-bold mb-1">${planPrice}</div>
          <div class="text-[#7a6f5d] text-xs mb-6">${subscription?.status === 'active' ? '✅ 已激活' : '⚠️ 未激活'}</div>
          <a href="/order/select" class="inline-block ${planIndex === 1 ? 'bg-[#f5f5dc] text-black' : 'border border-[#f5f5dc] text-[#f5f5dc]'} px-4 py-2 rounded-full text-sm font-medium hover:opacity-90">${subscription ? '升级套餐' : '开通套餐'} →</a>
        </div>

        <!-- Usage -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">用量统计</h2>
          ${usageTabsHtml}
        </div>

        <!-- API Key -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">API Key</h2>
          <div class="bg-black border border-[#3d2f1f] rounded-lg p-3 mb-4">
            <code id="apiKeyDisplay" class="text-[#7a6f5d] text-xs break-all">${apiKey ? '••••••••••••••••' : 'moon_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}</code>
          </div>
          <div class="flex items-center gap-3 mb-4">
            <button id="toggleKeyBtn" onclick="toggleApiKey()" class="text-[#f5f5dc] text-sm hover:underline">显示 Key</button>
            <button onclick="regenerateApiKey()" class="text-[#f5f5dc] text-sm hover:underline">重新生成</button>
          </div>
          <div id="copyFeedback" class="text-[#7a6f5d] text-xs mb-2"></div>
          <button onclick="copyApiKey()" class="text-[#a0937d] text-sm hover:text-[#f5f5dc]">📋 复制 Key</button>
          <input type="hidden" id="apiKeyValue" value="${apiKey}" />
        </div>

        <!-- API Usage Stats -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">使用统计</h2>
          <div id="apiKeyStats" class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-[#a0937d] text-sm">今日调用</span>
              <span id="todayCalls" class="text-[#f5f5dc] text-sm">-</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-[#a0937d] text-sm">今日消费</span>
              <span id="todayCost" class="text-[#f5f5dc] text-sm">-</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-[#a0937d] text-sm">最近使用</span>
              <span id="lastUsed" class="text-[#f5f5dc] text-sm">-</span>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">快捷操作</h2>
          <div class="space-y-3">
            <a href="/order/select" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>💰</span> ${subscription ? '升级套餐' : '开通套餐'}
            </a>
            <a href="/orders" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>📝</span> 订单历史
            </a>
            <a href="#" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>📊</span> 使用统计
            </a>
            <a href="/logout" onclick="return confirm('确定要退出登录吗？')" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>🚪</span> 退出登录
            </a>
          </div>
        </div>

        <!-- AI Preferences -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">AI 偏好设置</h2>
          <div class="space-y-4">
            <div>
              <label class="text-[#a0937d] text-sm block mb-2">模型等级</label>
              <select id="preferredTier" onchange="updatePreferences()" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-2 text-[#f5f5dc] focus:border-[#f5f5dc] outline-none">
                <option value="🌕">🌕 高级模型 — GPT-4o、Claude 4、Gemini 2.0｜效果最佳，成本较高</option>
                <option value="🌓">🌓 均衡模型 — Kimi、Qwen Turbo、MiniMax｜性价比之选</option>
                <option value="🌑">🌑 轻量模型 — GPT-4o Mini、Qwen Long、DeepSeek V4 Flash｜响应快、成本低</option>
              </select>
              <p class="text-[#5a4d3d] text-xs mt-1">选择 AI 模型的性能等级，系统会优先使用该等级中成本最低的模型</p>
            </div>
            <div>
              <label class="text-[#a0937d] text-sm block mb-2">指定模型（可选）</label>
              <select id="preferredProvider" onchange="updatePreferences()" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-2 text-[#f5f5dc] focus:border-[#f5f5dc] outline-none">
                <optgroup label="🌕 高级模型">
                  <option value="">自动选择（推荐）</option>
                <option value="openai">OpenAI GPT-4o</option>
                <option value="anthropic">Anthropic Claude 4 Sonnet</option>
                <option value="google">Google Gemini 2.0 Flash</option>
                <option value="deepseek">DeepSeek V4 Flash</option>
                </optgroup>
                <optgroup label="🌓 均衡模型">
                  <option value="kimi">Kimi Core</option>
                  <option value="minimax">MiniMax ABAB 6.5S</option>
                  <option value="qwen">Qwen Turbo</option>
                </optgroup>
                <optgroup label="🌑 轻量模型">
                  <option value="openai-mini">GPT-4o Mini (Search)</option>
                  <option value="qwen-long">Qwen Long</option>
                </optgroup>
              </select>
              <p class="text-[#5a4d3d] text-xs mt-1">指定后系统会优先使用该模型，否则自动选择同等级中成本最低的模型</p>
            </div>
            <div class="bg-[#1a1a1a] border border-[#3d2f1f] rounded-lg p-3">
              <div class="flex items-center gap-2">
                <input type="checkbox" id="usePersonalApiKey" onchange="togglePersonalApiKey(); updatePreferences()" class="w-4 h-4 rounded border-[#3d2f1f] bg-black checked:bg-[#f5f5dc]" />
                <label for="usePersonalApiKey" class="text-[#a0937d] text-sm">使用自己的 API Key</label>
              </div>
              <p class="text-[#5a4d3d] text-xs mt-2">开启后，你的请求将使用自己的 API Key 直接调用对应服务商，不再通过平台中转。</p>
              <div id="personalApiKeySection" class="hidden mt-3">
                <label class="text-[#a0937d] text-sm block mb-2">第三方 API Key</label>
                <input type="password" id="personalApiKey" placeholder="输入你的 API Key" onchange="updatePreferences()" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-2 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
                <div class="flex items-start gap-2 mt-2 text-[#8b7355] text-xs">
                  <span>⚠️</span>
                  <span>你的 API Key 仅存储在本地浏览器中，不会传至平台服务器。请确保 Key 安全，不要与他人分享。</span>
                </div>
              </div>
            </div>
          </div>
          <div id="prefStatus" class="text-[#7a6f5d] text-xs mt-3"></div>
        </div>
      </div>
    </main>

    ${footer()}

    <script>
      let keyVisible = false;
      const fullKey = document.getElementById('apiKeyValue').value;

      function toggleApiKey() {
        const display = document.getElementById('apiKeyDisplay');
        const btn = document.getElementById('toggleKeyBtn');
        if (keyVisible) {
          display.textContent = '••••••••••••••••';
          btn.textContent = '显示 Key';
          keyVisible = false;
        } else {
          display.textContent = fullKey;
          btn.textContent = '隐藏 Key';
          keyVisible = true;
        }
      }

      function copyApiKey() {
        navigator.clipboard.writeText(fullKey).then(() => {
          document.getElementById('copyFeedback').textContent = '✅ 已复制';
          setTimeout(() => {
            document.getElementById('copyFeedback').textContent = '';
          }, 2000);
        });
      }

      async function regenerateApiKey() {
        if (!confirm('确定要重新生成 API Key 吗？旧 Key 将立即失效。')) return;
        try {
          const res = await fetch('/api/apikey/regenerate', { method: 'POST' });
          const data = await res.json();
          if (data.apiKey) {
            document.getElementById('apiKeyValue').value = data.apiKey;
            document.getElementById('apiKeyDisplay').textContent = '••••••••••••••••';
            keyVisible = false;
            document.getElementById('toggleKeyBtn').textContent = '显示 Key';
            document.getElementById('copyFeedback').textContent = '✅ 新 Key 已生成';
          }
        } catch (e) {
          alert('重新生成失败');
        }
      }

      // Load AI preferences on page load
      async function loadPreferences() {
        try {
          const res = await fetch('/api/ai/preferences');
          const data = await res.json();
          if (data.preferredTier) {
            document.getElementById('preferredTier').value = data.preferredTier;
          }
          if (data.preferredProvider) {
            document.getElementById('preferredProvider').value = data.preferredProvider;
          }
          if (data.usePersonalApiKey) {
            document.getElementById('usePersonalApiKey').checked = true;
            document.getElementById('personalApiKeySection').classList.remove('hidden');
          }
          if (data.personalApiKey) {
            document.getElementById('personalApiKey').value = data.personalApiKey;
          }
        } catch (e) {
          console.error('Failed to load preferences:', e);
        }
      }

      function togglePersonalApiKey() {
        const usePersonal = document.getElementById('usePersonalApiKey').checked;
        const section = document.getElementById('personalApiKeySection');
        if (usePersonal) {
          section.classList.remove('hidden');
        } else {
          section.classList.add('hidden');
        }
      }

      async function updatePreferences() {
        const preferredTier = document.getElementById('preferredTier').value;
        const preferredProvider = document.getElementById('preferredProvider').value;
        const usePersonalApiKey = document.getElementById('usePersonalApiKey').checked;
        const personalApiKey = document.getElementById('personalApiKey').value;

        try {
          const res = await fetch('/api/ai/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              preferredTier,
              preferredProvider: preferredProvider || undefined,
              usePersonalApiKey,
              personalApiKey: usePersonalApiKey ? personalApiKey : undefined,
            }),
          });
          const data = await res.json();
          const statusEl = document.getElementById('prefStatus');
          if (data.success) {
            statusEl.textContent = '✅ 设置已保存';
          } else {
            statusEl.textContent = '❌ 保存失败';
          }
          setTimeout(() => { statusEl.textContent = ''; }, 2000);
        } catch (e) {
          document.getElementById('prefStatus').textContent = '❌ 保存失败';
        }
      }

      // Load API key stats on page load
      async function loadApiKeyStats() {
        try {
          const res = await fetch('/api/apikey/stats');
          const data = await res.json();
          if (data.stats) {
            document.getElementById('todayCalls').textContent = data.stats.todayRequestCount + ' 次';
            document.getElementById('todayCost').textContent = '$' + data.stats.todayCostUSD.toFixed(4);
          }
          if (data.keys && data.keys.length > 0 && data.keys[0].lastUsedAt) {
            const lastUsed = new Date(data.keys[0].lastUsedAt);
            const now = new Date();
            const diffMs = now.getTime() - lastUsed.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            let timeAgo;
            if (diffDays > 0) {
              timeAgo = diffDays + ' 天前';
            } else if (diffHours > 0) {
              timeAgo = diffHours + ' 小时前';
            } else if (diffMins > 0) {
              timeAgo = diffMins + ' 分钟前';
            } else {
              timeAgo = '刚刚';
            }
            document.getElementById('lastUsed').textContent = timeAgo;
          } else {
            document.getElementById('lastUsed').textContent = '从未使用';
          }
        } catch (e) {
          console.error('Failed to load API key stats:', e);
        }
      }

      // Load preferences when page loads
      loadPreferences();
      loadApiKeyStats();
    </script>
  `);
}

app.get("/", (c) => c.html(moonPage()));
app.get("/pricing", (c) => c.html(pricingPage()));
app.get("/login", (c) => c.html(loginPage()));
app.get("/register", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (user) {
    return c.redirect("/order/select");
  }
  return c.html(registerPage());
});
app.get("/dashboard", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.redirect("/login");
  }
  const subscription = db.query("SELECT * FROM subscriptions WHERE user_id = ?").get(user.id) as { plan: string; status: string; expires_at: string | null } | undefined;
  const limits = getUserUsageLimits(user.id);
  // Get expiration warning
  const expirationWarning = getExpirationWarning(user.id);
  // Get usage stats for today/week/month
  const usageStats = getAllUsageStats(user.id);
  // Get quota warnings
  const quotaWarnings = getQuotaWarning(user.id);
  // Get user's API key or create one if none exists
  const apiKeyRow = db.query("SELECT key_hash FROM api_keys WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1").get(user.id) as { key_hash: string } | undefined;
  let apiKey = "";
  if (apiKeyRow) {
    apiKey = atob(apiKeyRow.key_hash);
  } else {
    // Auto-create API key for users who don't have one
    apiKey = generateApiKey();
    db.query(
      "INSERT INTO api_keys (id, user_id, key_hash, name) VALUES (?, ?, ?, ?)"
    ).run(generateId(), user.id, btoa(apiKey), "Default Key");
  }
  return c.html(dashboardPage(user.email, subscription, limits, apiKey, expirationWarning, usageStats, quotaWarnings));
});

app.post("/api/apikey/regenerate", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  // Deactivate old keys
  db.query("UPDATE api_keys SET is_active = 0 WHERE user_id = ?").run(user.id);
  // Generate new key
  const newKey = generateApiKey();
  db.query(
    "INSERT INTO api_keys (id, user_id, key_hash, name) VALUES (?, ?, ?, ?)"
  ).run(generateId(), user.id, btoa(newKey), "Default Key");
  return c.json({ apiKey: newKey });
});

// Get API key usage stats
app.get("/api/apikey/stats", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Get all API keys for user
  const keys = db.query(
    "SELECT id, name, created_at, last_used_at, is_active FROM api_keys WHERE user_id = ? ORDER BY created_at DESC"
  ).all(user.id) as Array<{
    id: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
    is_active: number;
  }>;

  // Get usage stats from cost_stats for each key (aggregate by user since cost_stats doesn't track per key)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const costStats = db.query(`
    SELECT date, input_tokens, output_tokens, cost_usd, request_count
    FROM cost_stats
    WHERE user_id = ? AND date >= ?
    ORDER BY date DESC
  `).all(user.id, thirtyDaysAgoStr) as Array<{
    date: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    request_count: number;
  }>;

  // Get today's usage events count
  const today = new Date().toISOString().split('T')[0];
  const todayStats = costStats.find(s => s.date === today);
  const totalRequestCount = costStats.reduce((sum, s) => sum + s.request_count, 0);
  const totalCostUSD = costStats.reduce((sum, s) => sum + s.cost_usd, 0);
  const totalInputTokens = costStats.reduce((sum, s) => sum + s.input_tokens, 0);
  const totalOutputTokens = costStats.reduce((sum, s) => sum + s.output_tokens, 0);

  return c.json({
    keys: keys.map(k => ({
      id: k.id,
      name: k.name,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
      isActive: k.is_active === 1,
    })),
    stats: {
      todayRequestCount: todayStats?.request_count ?? 0,
      todayInputTokens: todayStats?.input_tokens ?? 0,
      todayOutputTokens: todayStats?.output_tokens ?? 0,
      todayCostUSD: todayStats?.cost_usd ?? 0,
      totalRequestCount,
      totalCostUSD,
      totalInputTokens,
      totalOutputTokens,
    },
  });
});

app.post("/logout", async (c) => {
  c.header("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  return c.redirect("/");
});

app.get("/logout", async (c) => {
  c.header("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  return c.redirect("/");
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = body.email as string;
  const password = body.password as string;
  const remember = body.remember === "on";

  if (!email || !password) {
    return c.html(loginPageWithError("请填写邮箱和密码"), 400);
  }

  if (!isValidEmail(email)) {
    return c.html(loginPageWithError("请输入有效的邮箱地址"), 400);
  }

  const user = db
    .query("SELECT * FROM users WHERE email = ?")
    .get(email) as { id: string; email: string; password_hash: string } | undefined;

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.html(loginPageWithError("用户名或密码不正确，请重试"), 401);
  }

  const token = await createToken(user.id, user.email);
  const maxAge = remember ? 30 * 24 * 60 * 60 : SESSION_DURATION_MS / 1000;
  c.header("Set-Cookie", `session=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`);
  return c.redirect("/dashboard");
});

app.post("/register", async (c) => {
  const body = await c.req.parseBody();
  const email = body.email as string;
  const password = body.password as string;

  if (!email || !password) {
    return c.html(registerPageWithError("请填写邮箱和密码"), 400);
  }

  if (!isValidEmail(email)) {
    return c.html(registerPageWithError("请输入有效的邮箱地址"), 400);
  }

  const strength = checkPasswordStrength(password);
  if (!strength.isValid) {
    return c.html(registerPageWithError("密码不符合要求：" + strength.errors.join("、")), 400);
  }

  const existing = db
    .query("SELECT id FROM users WHERE email = ?")
    .get(email);

  if (existing) {
    return c.html(registerPageWithError("该邮箱已被注册"), 409);
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);

  db.query(
    "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
  ).run(id, email, passwordHash);

  // Generate API key on registration
  const apiKey = generateApiKey();
  db.query(
    "INSERT INTO api_keys (id, user_id, key_hash, name) VALUES (?, ?, ?, ?)"
  ).run(generateId(), id, btoa(apiKey), "Default Key");

  const token = await createToken(id, email);
  c.header("Set-Cookie", `session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}; SameSite=Lax`);
  return c.redirect("/dashboard");
});

app.get("/docs", (c) => c.html(docsPage()));

function docsPage() {
  return baseHtml(`
    ${navbar('/docs')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <div class="mb-12">
        <h1 class="text-3xl font-bold text-[#f5f5dc] mb-2">API 文档 📚</h1>
        <p class="text-[#a0937d]">了解 MOON API 的使用方法</p>
      </div>

      <!-- Auth Section -->
      <section class="mb-12">
        <h2 class="text-xl font-bold text-[#f5f5dc] mb-4 flex items-center gap-2">
          <span class="text-2xl">🔐</span> 认证方式
        </h2>
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <p class="text-[#a0937d] mb-4">所有 API 请求都需要通过 Cookie 认证。登录后会自动获得 session cookie。</p>
          <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
            <p class="text-[#7a6f5d] text-xs mb-2">请求示例</p>
            <pre class="text-[#f5f5dc] text-sm overflow-x-auto"><code>curl -X POST https://your-domain.com/api/ai/chat \\
  -H "Content-Type: application/json" \\
  -b "session=your-session-token" \\
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'</code></pre>
          </div>
        </div>
      </section>

      <!-- Models Section -->
      <section class="mb-12">
        <h2 class="text-xl font-bold text-[#f5f5dc] mb-4 flex items-center gap-2">
          <span class="text-2xl">🤖</span> 支持的模型
        </h2>
        <div class="space-y-4">
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <span class="text-2xl">🌕</span>
              <h3 class="text-[#f5f5dc] font-bold">Full Moon - 高级模型</h3>
            </div>
            <div class="grid md:grid-cols-3 gap-4">
              <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
                <div class="text-[#f5f5dc] font-medium mb-1">GPT-4o</div>
                <div class="text-[#7a6f5d] text-xs">OpenAI · 128K ctx</div>
                <div class="text-[#a0937d] text-xs mt-2">¥5/1M in · ¥15/1M out</div>
              </div>
              <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
                <div class="text-[#f5f5dc] font-medium mb-1">Claude Sonnet 4</div>
                <div class="text-[#7a6f5d] text-xs">Anthropic · 200K ctx</div>
                <div class="text-[#a0937d] text-xs mt-2">¥3/1M in · ¥15/1M out</div>
              </div>
              <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
                <div class="text-[#f5f5dc] font-medium mb-1">Gemini 2.0 Flash</div>
                <div class="text-[#7a6f5d] text-xs">Google · 1M ctx</div>
                <div class="text-[#a0937d] text-xs mt-2">免费</div>
              </div>
            </div>
          </div>

          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <span class="text-2xl">🌓</span>
              <h3 class="text-[#f5f5dc] font-bold">Half Moon - 高效模型</h3>
            </div>
            <div class="grid md:grid-cols-3 gap-4">
              <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
                <div class="text-[#f5f5dc] font-medium mb-1">Kimi Core</div>
                <div class="text-[#7a6f5d] text-xs">月之暗面 · 128K ctx</div>
                <div class="text-[#a0937d] text-xs mt-2">¥12/1M</div>
              </div>
              <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
                <div class="text-[#f5f5dc] font-medium mb-1">MiniMax ABAB 6.5S</div>
                <div class="text-[#7a6f5d] text-xs">MiniMax · 245K ctx</div>
                <div class="text-[#a0937d] text-xs mt-2">¥1/1M</div>
              </div>
              <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
                <div class="text-[#f5f5dc] font-medium mb-1">Qwen Turbo</div>
                <div class="text-[#7a6f5d] text-xs">阿里 · 131K ctx</div>
                <div class="text-[#a0937d] text-xs mt-2">¥0.8/1M in · ¥2/1M out</div>
              </div>
            </div>
          </div>

          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <span class="text-2xl">🌑</span>
              <h3 class="text-[#f5f5dc] font-bold">New Moon - 轻量模型</h3>
            </div>
            <div class="grid md:grid-cols-3 gap-4">
              <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
                <div class="text-[#f5f5dc] font-medium mb-1">GPT-4o Mini (Search)</div>
                <div class="text-[#7a6f5d] text-xs">OpenAI · 128K ctx</div>
                <div class="text-[#a0937d] text-xs mt-2">¥0.375/1M in · ¥1.5/1M out</div>
              </div>
              <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
                <div class="text-[#f5f5dc] font-medium mb-1">Qwen Long</div>
                <div class="text-[#7a6f5d] text-xs">阿里 · 1M ctx</div>
                <div class="text-[#a0937d] text-xs mt-2">¥0.8/1M in · ¥2/1M out</div>
              </div>
              <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
                <div class="text-[#f5f5dc] font-medium mb-1">DeepSeek V4 Flash</div>
                <div class="text-[#7a6f5d] text-xs">DeepSeek · 1M ctx</div>
                <div class="text-[#a0937d] text-xs mt-2">¥0.14/1M in · ¥0.28/1M out</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Endpoints Section -->
      <section class="mb-12">
        <h2 class="text-xl font-bold text-[#f5f5dc] mb-4 flex items-center gap-2">
          <span class="text-2xl">📡</span> API 端点
        </h2>
        <div class="space-y-4">
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-3">
              <span class="bg-green-900/30 text-green-200 px-2 py-1 rounded text-xs font-bold">POST</span>
              <span class="text-[#f5f5dc] font-mono">/api/ai/chat</span>
            </div>
            <p class="text-[#a0937d] text-sm mb-4">发送消息并获取 AI 回复，支持自动路由或指定模型</p>
            <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
              <p class="text-[#7a6f5d] text-xs mb-2">请求体</p>
              <pre class="text-[#f5f5dc] text-sm overflow-x-auto"><code>{
  "messages": [
    {"role": "system", "content": "你是一个有帮助的助手"},
    {"role": "user", "content": "你好"}
  ],
  "tier": "🌕",       // 可选：🌕 🌓 🌑
  "model": "gpt-4o",  // 可选：直接指定模型
  "temperature": 0.7  // 可选：0-2
}</code></pre>
            </div>
            <div class="bg-black border border-[#3d2f1f] rounded-lg p-4 mt-3">
              <p class="text-[#7a6f5d] text-xs mb-2">响应示例</p>
              <pre class="text-[#f5f5dc] text-sm overflow-x-auto"><code>{
  "content": "你好！有什么可以帮助你的吗？",
  "model": "gpt-4o",
  "provider": "openai",
  "tier": "🌕",
  "usage": {
    "inputTokens": 20,
    "outputTokens": 35,
    "totalCostUSD": 0.000525
  }
}</code></pre>
            </div>
          </div>

          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-3">
              <span class="bg-blue-900/30 text-blue-200 px-2 py-1 rounded text-xs font-bold">GET</span>
              <span class="text-[#f5f5dc] font-mono">/api/ai/models</span>
            </div>
            <p class="text-[#a0937d] text-sm mb-4">获取所有可用的 AI 模型列表</p>
          </div>

          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-3">
              <span class="bg-blue-900/30 text-blue-200 px-2 py-1 rounded text-xs font-bold">GET</span>
              <span class="text-[#f5f5dc] font-mono">/api/ai/usage</span>
            </div>
            <p class="text-[#a0937d] text-sm mb-4">获取当前用户的 API 使用量和配额</p>
          </div>

          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-3">
              <span class="bg-blue-900/30 text-blue-200 px-2 py-1 rounded text-xs font-bold">GET</span>
              <span class="text-[#f5f5dc] font-mono">/api/plans</span>
            </div>
            <p class="text-[#a0937d] text-sm mb-4">获取所有可用套餐信息</p>
          </div>
        </div>
      </section>

      <!-- Pricing Section -->
      <section class="mb-12">
        <h2 class="text-xl font-bold text-[#f5f5dc] mb-4 flex items-center gap-2">
          <span class="text-2xl">💰</span> 价格说明
        </h2>
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <div class="grid md:grid-cols-3 gap-6">
            <div class="text-center">
              <div class="text-3xl mb-2">🌕</div>
              <div class="text-[#f5f5dc] font-bold mb-1">入门套餐</div>
              <div class="text-[#f5f5dc] text-2xl font-bold mb-2">¥9.9</div>
              <div class="text-[#a0937d] text-sm">30次/天</div>
              <div class="text-[#7a6f5d] text-xs mt-1">高级模型额度</div>
            </div>
            <div class="text-center">
              <div class="text-3xl mb-2">🌓</div>
              <div class="text-[#f5f5dc] font-bold mb-1">普通套餐</div>
              <div class="text-[#f5f5dc] text-2xl font-bold mb-2">¥39</div>
              <div class="text-[#a0937d] text-sm">200次/天</div>
              <div class="text-[#7a6f5d] text-xs mt-1">高级模型额度</div>
            </div>
            <div class="text-center">
              <div class="text-3xl mb-2">🌑</div>
              <div class="text-[#f5f5dc] font-bold mb-1">高级套餐</div>
              <div class="text-[#f5f5dc] text-2xl font-bold mb-2">¥99</div>
              <div class="text-[#a0937d] text-sm">1000次/天</div>
              <div class="text-[#7a6f5d] text-xs mt-1">高级模型额度</div>
            </div>
          </div>
          <div class="mt-6 pt-6 border-t border-[#3d2f1f] text-center">
            <p class="text-[#a0937d] text-sm">🌑 轻量模型不限量使用</p>
            <p class="text-[#7a6f5d] text-xs mt-1">超额后自动降级到低层级模型</p>
          </div>
        </div>
      </section>

      <!-- SDK Section -->
      <section class="mb-12">
        <h2 class="text-xl font-bold text-[#f5f5dc] mb-4 flex items-center gap-2">
          <span class="text-2xl">📦</span> SDK 示例
        </h2>
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h3 class="text-[#f5f5dc] font-medium mb-4">JavaScript / Node.js</h3>
          <div class="bg-black border border-[#3d2f1f] rounded-lg p-4">
            <pre class="text-[#f5f5dc] text-sm overflow-x-auto"><code>const response = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',  // 携带 cookie
  body: JSON.stringify({
    messages: [
      { role: 'user', content: '用中文回答' }
    ],
    tier: '🌕'
  })
});

const data = await response.json();
console.log(data.content);</code></pre>
          </div>
        </div>
      </section>
    </main>

    ${footer()}
  `);
}

app.get("/health", (c) =>
  c.json({
    ok: true,
    database: "ready",
  }),
);

app.get("/api/plans", (c) => c.json(plans));

app.get("/api/moon", (c) =>
  c.json({
    routing: ["🌕", "🌓", "🌑"],
    tiers: modelTiers,
  }),
);

app.get("/api/stats", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  try {
    const userCount = db.query("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    const subscriptionCount = db.query("SELECT COUNT(*) AS count FROM subscriptions").get() as { count: number };
    return c.json({
      users: userCount.count,
      subscriptions: subscriptionCount.count,
    });
  } catch (err) {
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

app.post("/order/create", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.redirect("/login");
  }

  const body = await c.req.parseBody();
  const planName = body.plan as string;
  const billingCycle = (body.billing_cycle as string) || 'monthly';

  if (!planName || !planPrices[planName]) {
    return c.redirect("/order/select");
  }

  const fee = billingCycle === 'yearly' ? planPricesYearly[planName] : planPrices[planName];
  const outTradeNo = generateId();
  const email = user.email;

  db.query(
    "INSERT INTO orders (out_trade_no, user_id, plan, billing_cycle, fee, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(outTradeNo, user.id, planName, billingCycle, fee, email, "pending");

  return c.html(orderPage(planName, outTradeNo, fee, billingCycle));
});

app.get("/order/success", async (c) => {
  const outTradeNo = c.req.query("trade_no");
  if (!outTradeNo) {
    return c.redirect("/");
  }

  const order = db.query("SELECT * FROM orders WHERE out_trade_no = ?").get(outTradeNo) as Order | undefined;
  if (!order || order.status === "paid") {
    return c.redirect("/dashboard");
  }

  const userId = order.user_id;

  // Update order status first
  db.query("UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE out_trade_no = ?").run(outTradeNo);

  if (!userId) {
    // User ID not found - log error for investigation
    console.error(`[/order/success] Payment success but no user_id for order ${outTradeNo}, email: ${order.email}`);
    return c.html(orderSuccessPage(outTradeNo));
  }

  // Calculate new expires_at based on existing subscription and billing_cycle
  const now = new Date();
  let newExpiresAt: Date;

  const existingSub = db.query("SELECT * FROM subscriptions WHERE user_id = ?").get(userId) as { id: string; expires_at: string | null } | undefined;

  if (existingSub && existingSub.expires_at) {
    const existingExpires = new Date(existingSub.expires_at);
    if (existingExpires > now) {
      // Subscription not expired: extend from existing expires_at
      newExpiresAt = existingExpires;
    } else {
      // Subscription expired: start from today
      newExpiresAt = now;
    }
  } else {
    // No existing subscription: start from today
    newExpiresAt = now;
  }

  // Add billing period
  newExpiresAt.setMonth(newExpiresAt.getMonth() + (order.billing_cycle === 'yearly' ? 12 : 1));
  const expiresAtStr = newExpiresAt.toISOString();

  if (existingSub) {
    db.query(
      "UPDATE subscriptions SET plan = ?, period = ?, status = 'active', expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).run(order.plan, order.billing_cycle, expiresAtStr, userId);
  } else {
    db.query(
      "INSERT INTO subscriptions (user_id, plan, period, status, expires_at) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, order.plan, order.billing_cycle, "active", expiresAtStr);
  }

  // Send activation email
  sendSubscriptionActivationEmail(order.email, order.plan, order.billing_cycle, expiresAtStr).catch(err => {
    console.error('Failed to send activation email:', err);
  });

  return c.html(orderSuccessPage(outTradeNo, order.plan, order.billing_cycle));
});

app.get("/order/cancel", async (c) => {
  const outTradeNo = c.req.query("trade_no");
  if (!outTradeNo) {
    return c.redirect("/");
  }

  db.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE out_trade_no = ?").run(outTradeNo);

  return c.html(orderCancelPage(outTradeNo));
});

app.get("/order/select", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.redirect("/login");
  }
  return c.html(selectPlanPage());
});

app.get("/orders", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.redirect("/login");
  }

  const orders = db.query(
    "SELECT * FROM orders WHERE email = ? ORDER BY created_at DESC"
  ).all(user.email) as Order[];

  return c.html(ordersPage(user.email, orders));
});

app.post("/order/callback", async (c) => {
  const body = await c.req.json();
  const { out_trade_no, onepay_id, status } = body;

  if (!out_trade_no) {
    return c.json({ error: "missing out_trade_no" }, 400);
  }

  const order = db.query("SELECT * FROM orders WHERE out_trade_no = ?").get(out_trade_no) as Order | undefined;
  if (!order) {
    return c.json({ error: "order not found" }, 404);
  }

  if (status === "paid") {
    const userId = order.user_id;

    // Update order status first
    db.query(
      "UPDATE orders SET status = 'paid', onepay_id = ?, updated_at = CURRENT_TIMESTAMP WHERE out_trade_no = ?"
    ).run(onepay_id, out_trade_no);

    if (!userId) {
      // User ID not found - log error for alerting
      console.error(`[/order/callback] Payment success but no user_id for order ${out_trade_no}, email: ${order.email}`);
      return c.json({ success: true, warning: "user_not_found" });
    }

    // Calculate new expires_at based on existing subscription and billing_cycle
    const now = new Date();
    let newExpiresAt: Date;

    const existingSub = db.query("SELECT * FROM subscriptions WHERE user_id = ?").get(userId) as { id: string; expires_at: string | null } | undefined;

    if (existingSub && existingSub.expires_at) {
      const existingExpires = new Date(existingSub.expires_at);
      if (existingExpires > now) {
        // Subscription not expired: extend from existing expires_at
        newExpiresAt = existingExpires;
      } else {
        // Subscription expired: start from today
        newExpiresAt = now;
      }
    } else {
      // No existing subscription: start from today
      newExpiresAt = now;
    }

    // Add billing period
    newExpiresAt.setMonth(newExpiresAt.getMonth() + (order.billing_cycle === 'yearly' ? 12 : 1));
    const expiresAtStr = newExpiresAt.toISOString();

    if (existingSub) {
      db.query(
        "UPDATE subscriptions SET plan = ?, period = ?, status = 'active', expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).run(order.plan, order.billing_cycle, expiresAtStr, userId);
    } else {
      db.query(
        "INSERT INTO subscriptions (user_id, plan, period, status, expires_at) VALUES (?, ?, ?, ?, ?)"
      ).run(userId, order.plan, order.billing_cycle, "active", expiresAtStr);
    }
  } else if (status === "cancelled" || status === "failed") {
    db.query("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE out_trade_no = ?").run(status, out_trade_no);
  }

  return c.json({ success: true });
});

app.get("/api/order/status", async (c) => {
  const outTradeNo = c.req.query("out_trade_no");
  if (!outTradeNo) {
    return c.json({ error: "missing out_trade_no" }, 400);
  }

  const order = db.query("SELECT * FROM orders WHERE out_trade_no = ?").get(outTradeNo) as Order | undefined;
  if (!order) {
    return c.json({ error: "order not found" }, 404);
  }

  return c.json({ status: order.status, out_trade_no: order.out_trade_no });
});

app.get("/api/subscription", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const subscription = db.query("SELECT * FROM subscriptions WHERE user_id = ?").get(user.id) as { plan: string; status: string; expires_at: string | null } | undefined;
  const expirationWarning = getExpirationWarning(user.id);

  if (!subscription) {
    return c.json({ plan: null, status: "inactive", expired: false });
  }

  return c.json({
    ...subscription,
    expired: isSubscriptionExpired(user.id),
    expirationWarning
  });
});

// AI Chat endpoint with automatic routing
app.post("/api/ai/chat", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Check if subscription is expired
  if (isSubscriptionExpired(user.id)) {
    return c.json({
      error: "subscription_expired",
      message: "您的套餐已过期，请续费以继续使用服务。"
    }, 403);
  }

  try {
    const body = await c.req.json();
    const { messages, tier, model } = body as {
      messages: AIRequest['messages'];
      tier?: '🌕' | '🌓' | '🌑';
      model?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: "messages is required and must be a non-empty array" }, 400);
    }

    // Get user's AI preferences
    const userPrefs = db.query(
      "SELECT * FROM user_ai_preferences WHERE user_id = ?"
    ).get(user.id) as {
      preferred_provider: string | null;
      preferred_model: string | null;
      preferred_tier: string;
      use_personal_api_key: number;
      personal_api_key: string | null;
    } | undefined;

    // Determine which model to use - respect user preferences
    let selectedModel: string;
    let selectedTier: '🌕' | '🌓' | '🌑';

    if (model && MODEL_CONFIGS[model]) {
      selectedModel = model;
      selectedTier = MODEL_CONFIGS[model].tier;
    } else if (userPrefs?.preferred_model && MODEL_CONFIGS[userPrefs.preferred_model]) {
      selectedModel = userPrefs.preferred_model;
      selectedTier = MODEL_CONFIGS[selectedModel].tier;
    } else if (tier && ['🌕', '🌓', '🌑'].includes(tier)) {
      selectedTier = tier;
      selectedModel = DEFAULT_MODELS[tier];
    } else if (userPrefs?.preferred_tier && ['🌕', '🌓', '🌑'].includes(userPrefs.preferred_tier)) {
      selectedTier = userPrefs.preferred_tier;
      selectedModel = DEFAULT_MODELS[selectedTier];
    } else {
      // Default to full moon tier
      selectedTier = '🌕';
      selectedModel = DEFAULT_MODELS['🌕'];
    }

    // Check user quota for selected tier
    if (!hasQuota(user.id, selectedTier)) {
      // Try to fallback to lower tiers
      const fallbackTiers: Array<'🌕' | '🌓' | '🌑'> = ['🌕', '🌓', '🌑'];
      const currentIdx = fallbackTiers.indexOf(selectedTier);
      let usedFallback = false;

      for (let i = currentIdx + 1; i < fallbackTiers.length; i++) {
        const lowerTier = fallbackTiers[i];
        if (hasQuota(user.id, lowerTier)) {
          selectedTier = lowerTier;
          selectedModel = DEFAULT_MODELS[lowerTier];
          usedFallback = true;
          break;
        }
      }

      if (!usedFallback) {
        // Check if user is on free trial - provide appropriate message
        const limits = getUserUsageLimits(user.id);
        let noQuotaMessage = `${selectedTier} 额度已用完，请升级套餐或稍后再试`;

        // Provide more helpful message for free trial users
        const trialMsg = getFreeTrialMessage(limits);
        if (trialMsg) {
          noQuotaMessage = trialMsg;
        } else if (isOnFreeTrial(user.id)) {
          noQuotaMessage = '您的免费试用额度已用完，请购买套餐以继续使用服务。';
        }

        return c.json({
          error: "quota_exceeded",
          tier: selectedTier,
          message: noQuotaMessage,
        }, 429);
      }
    }

    // Make AI request
    const request: AIRequest = {
      model: selectedModel,
      messages,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    };

    // If user has a preferred provider, route to that provider if possible
    if (userPrefs?.preferred_provider && !model) {
      const providerConfig = MODEL_CONFIGS[selectedModel];
      if (providerConfig && providerConfig.provider !== userPrefs.preferred_provider) {
        // Find a model from the preferred provider in the same tier
        const modelEntry = Object.entries(MODEL_CONFIGS).find(
          ([, cfg]) => cfg.provider === userPrefs.preferred_provider && cfg.tier === selectedTier
        );
        if (modelEntry) {
          selectedModel = modelEntry[0];
          request.model = selectedModel;
        }
      }
    }

    // Pass personal API key settings to router if user has enabled it
    const routingOptions: { personalApiKey?: string; personalProvider?: string } = {};
    if (userPrefs?.use_personal_api_key && userPrefs?.personal_api_key && userPrefs?.preferred_provider) {
      routingOptions.personalApiKey = userPrefs.personal_api_key;
      routingOptions.personalProvider = userPrefs.preferred_provider;
    }

    const response = await routeAIRequest(request, routingOptions);

    // Record usage and cost
    if (response.usage) {
      recordUsage(user.id, response.usage.inputTokens, response.usage.outputTokens, response.usage.totalCostUSD);
    }
    recordUsageEvent(user.id, selectedTier, selectedModel);

    // Update API key last_used_at timestamp
    updateApiKeyLastUsed(user.id);

    return c.json({
      content: response.content,
      model: response.model,
      provider: response.provider,
      tier: selectedTier,
      usage: response.usage,
    });
  } catch (err) {
    console.error("AI chat error:", err);
    return c.json({ error: "AI request failed", details: String(err) }, 500);
  }
});

// List available AI models
app.get("/api/ai/models", (c) => {
  const tiers = ['🌕', '🌓', '🌑'] as const;
  const result = tiers.map(tier => ({
    tier,
    models: getModelsForTier(tier).map(m => ({
      id: m.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      name: m.name,
      provider: m.provider,
      inputCostPer1M: m.inputCostPer1M,
      outputCostPer1M: m.outputCostPer1M,
    })),
  }));
  return c.json(result);
});

// Check configured AI providers
app.get("/api/ai/providers", (c) => {
  const configured = getConfiguredProviders();
  return c.json({
    configured,
    allProviders: ['openai', 'anthropic', 'google', 'kimi', 'minimax', 'qwen', 'deepseek'],
  });
});

// Get user's AI preferences
app.get("/api/ai/preferences", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const prefs = db.query(
    "SELECT * FROM user_ai_preferences WHERE user_id = ?"
  ).get(user.id) as {
    preferred_provider: string | null;
    preferred_model: string | null;
    preferred_tier: string;
    use_personal_api_key: number;
    personal_api_key: string | null;
  } | undefined;

  if (!prefs) {
    return c.json({
      preferredProvider: null,
      preferredModel: null,
      preferredTier: '🌕',
      usePersonalApiKey: false,
      personalApiKey: null,
    });
  }

  return c.json({
    preferredProvider: prefs.preferred_provider,
    preferredModel: prefs.preferred_model,
    preferredTier: prefs.preferred_tier,
    usePersonalApiKey: prefs.use_personal_api_key === 1,
    personalApiKey: prefs.personal_api_key,
  });
});

// Update user's AI preferences
app.put("/api/ai/preferences", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const {
      preferredProvider,
      preferredModel,
      preferredTier,
      usePersonalApiKey,
      personalApiKey,
    } = body as {
      preferredProvider?: string;
      preferredModel?: string;
      preferredTier?: '🌕' | '🌓' | '🌑';
      usePersonalApiKey?: boolean;
      personalApiKey?: string;
    };

    // Validate tier
    if (preferredTier && !['🌕', '🌓', '🌑'].includes(preferredTier)) {
      return c.json({ error: "Invalid tier. Must be 🌕, 🌓, or 🌑" }, 400);
    }

    // Validate provider
    const validProviders = ['openai', 'anthropic', 'google', 'kimi', 'minimax', 'qwen', 'deepseek'];
    if (preferredProvider && !validProviders.includes(preferredProvider)) {
      return c.json({ error: "Invalid provider" }, 400);
    }

    // Check if preferences exist
    const existing = db.query(
      "SELECT id FROM user_ai_preferences WHERE user_id = ?"
    ).get(user.id);

    const now = new Date().toISOString();

    if (existing) {
      // Update existing
      const updates: string[] = ["updated_at = ?"];
      const values: unknown[] = [now];

      if (preferredProvider !== undefined) {
        updates.push("preferred_provider = ?");
        values.push(preferredProvider || null);
      }
      if (preferredModel !== undefined) {
        updates.push("preferred_model = ?");
        values.push(preferredModel || null);
      }
      if (preferredTier !== undefined) {
        updates.push("preferred_tier = ?");
        values.push(preferredTier);
      }
      if (usePersonalApiKey !== undefined) {
        updates.push("use_personal_api_key = ?");
        values.push(usePersonalApiKey ? 1 : 0);
      }
      if (personalApiKey !== undefined) {
        updates.push("personal_api_key = ?");
        values.push(personalApiKey || null);
      }

      values.push(user.id);
      db.query(`UPDATE user_ai_preferences SET ${updates.join(", ")} WHERE user_id = ?`).run(...values);
    } else {
      // Insert new
      const id = generateId();
      db.query(`
        INSERT INTO user_ai_preferences (id, user_id, preferred_provider, preferred_model, preferred_tier, use_personal_api_key, personal_api_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        user.id,
        preferredProvider || null,
        preferredModel || null,
        preferredTier || '🌕',
        usePersonalApiKey ? 1 : 0,
        personalApiKey || null,
        now,
        now
      );
    }

    return c.json({ success: true });
  } catch (err) {
    console.error("Update preferences error:", err);
    return c.json({ error: "Failed to update preferences" }, 500);
  }
});

// Get user's AI usage stats
app.get("/api/ai/usage", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const limits = getUserUsageLimits(user.id);
  return c.json({
    limits: {
      fullMoon: { limit: limits.fullMoon.limit, used: limits.fullMoon.used, remaining: limits.fullMoon.limit - limits.fullMoon.used },
      halfMoon: { limit: limits.halfMoon.limit, used: limits.halfMoon.used, remaining: limits.halfMoon.limit - limits.halfMoon.used },
      newMoon: { limit: limits.newMoon.limit, used: limits.newMoon.used, remaining: limits.newMoon.limit === Infinity ? 'unlimited' : limits.newMoon.limit - limits.newMoon.used },
    },
  });
});

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
