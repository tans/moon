import { Hono } from "hono";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { routeAIRequest, getConfiguredProviders, getModelsForTier, type AIRequest } from "./ai/router";
import { recordUsage, getUserUsageLimits, recordUsageEvent, hasQuota } from "./ai/cost";
import { DEFAULT_MODELS, MODEL_CONFIGS } from "./ai/models";

const JWT_SECRET = process.env.JWT_SECRET || "moon-secret-key-change-in-production";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
  plan: string;
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

function orderPage(planName: string, outTradeNo: string, fee: number) {
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

function orderSuccessPage(outTradeNo: string) {
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-6xl mb-4">✅</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">支付成功</h1>
        <p class="text-[#a0937d] mt-2">您的订阅已激活</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 text-center">
        <p class="text-[#a0937d] text-sm mb-6">订单号：${outTradeNo}</p>
        <a href="/dashboard" class="inline-block bg-[#f5f5dc] text-black px-6 py-3 rounded-full font-medium hover:bg-[#d4c4a8]">返回后台</a>
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
            <form method="POST" action="/order/create">
              <input type="hidden" name="plan" value="${plan.name}" />
              <button type="submit" class="block w-full ${i === 1 ? 'bg-[#f5f5dc] text-black' : 'border border-[#f5f5dc] text-[#f5f5dc]'} px-6 py-3 rounded-full font-medium hover:opacity-90">立即开通</button>
            </form>
          </div>
        `).join('')}
      </div>
    </main>

    ${footer()}
  `);
}

const app = new Hono();

function baseHtml(content: string) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="coffee">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MOON | Model Always Online</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5.0.9/dist/full.min.css" />
    <style>
      * { box-sizing: border-box; }
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
        <div class="bg-red-900/30 border border-red-800 text-red-200 rounded-lg px-4 py-3 mb-4 text-sm">
          ${error}
        </div>
        <form method="POST" action="/login" class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" name="email" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" name="password" placeholder="••••••••" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <button type="submit" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8]">登录</button>
        </form>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          还没有账号？<a href="/register" class="text-[#f5f5dc] hover:underline">立即注册</a>
        </div>
      </div>
    </main>

    ${footer()}
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
        <form method="POST" action="/login" class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" name="email" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" name="password" placeholder="••••••••" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <button type="submit" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8]">登录</button>
        </form>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          还没有账号？<a href="/register" class="text-[#f5f5dc] hover:underline">立即注册</a>
        </div>
      </div>
    </main>

    ${footer()}
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

function dashboardPage(
  email: string,
  subscription: { plan: string; status: string } | undefined,
  usage: { fullMoon: { limit: number; used: number }; halfMoon: { limit: number; used: number }; newMoon: { limit: number; used: number } },
  apiKey: string
) {
  const planData = plans.find(p => p.name === subscription?.plan);
  const planName = planData?.name || "未订阅";
  const planPrice = planData?.price || "-";
  const planIndex = planData ? plans.indexOf(planData) : -1;

  const formatLimit = (n: number) => n === Infinity ? '不限' : n.toString();

  return baseHtml(`
    ${navbar('/dashboard')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-[#f5f5dc]">用户后台 🌙</h1>
        <p class="text-[#a0937d]">${email}</p>
      </div>

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
          <h2 class="text-[#f5f5dc] font-bold mb-4">今日用量</h2>
          <div class="space-y-3">
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
          </div>
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
            <a href="/logout" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>🚪</span> 退出登录
            </a>
          </div>
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
    </script>
  `);
}

app.get("/", (c) => c.html(moonPage()));
app.get("/pricing", (c) => c.html(pricingPage()));
app.get("/login", (c) => c.html(loginPage()));
app.get("/register", (c) => c.html(registerPage()));
app.get("/dashboard", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.redirect("/login");
  }
  const subscription = db.query("SELECT * FROM subscriptions WHERE user_id = ?").get(user.email) as { plan: string; status: string } | undefined;
  const limits = getUserUsageLimits(user.id);
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
  return c.html(dashboardPage(user.email, subscription, limits, apiKey));
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
    return c.html(loginPageWithError("邮箱或密码错误"), 401);
  }

  const token = await createToken(user.id, user.email);

  c.header("Set-Cookie", `session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}; SameSite=Lax`);
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

  if (password.length < 6) {
    return c.html(registerPageWithError("密码至少需要6个字符"), 400);
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

  if (!planName || !planPrices[planName]) {
    return c.redirect("/order/select");
  }

  const fee = planPrices[planName];
  const outTradeNo = generateId();
  const email = user.email;

  db.query(
    "INSERT INTO orders (out_trade_no, plan, fee, email, status) VALUES (?, ?, ?, ?, ?)"
  ).run(outTradeNo, planName, fee, email, "pending");

  return c.html(orderPage(planName, outTradeNo, fee));
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

  db.query("UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE out_trade_no = ?").run(outTradeNo);

  const existingSub = db.query("SELECT * FROM subscriptions WHERE user_id = ?").get(order.email ?? "") as { id: string } | undefined;

  if (existingSub) {
    db.query(
      "UPDATE subscriptions SET plan = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).run(order.plan, order.email ?? "");
  } else {
    db.query(
      "INSERT INTO subscriptions (user_id, plan, status) VALUES (?, ?, ?)"
    ).run(order.email ?? "", order.plan, "active");
  }

  return c.html(orderSuccessPage(outTradeNo));
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
    db.query(
      "UPDATE orders SET status = 'paid', onepay_id = ?, updated_at = CURRENT_TIMESTAMP WHERE out_trade_no = ?"
    ).run(onepay_id, out_trade_no);

    const existingSub = db.query("SELECT * FROM subscriptions WHERE user_id = ?").get(order.email ?? "") as { id: string } | undefined;

    if (existingSub) {
      db.query(
        "UPDATE subscriptions SET plan = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).run(order.plan, order.email ?? "");
    } else {
      db.query(
        "INSERT INTO subscriptions (user_id, plan, status) VALUES (?, ?, ?)"
      ).run(order.email ?? "", order.plan, "active");
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

  const subscription = db.query("SELECT * FROM subscriptions WHERE user_id = ?").get(user.email) as { plan: string; status: string } | undefined;

  if (!subscription) {
    return c.json({ plan: null, status: "inactive" });
  }

  return c.json(subscription);
});

// AI Chat endpoint with automatic routing
app.post("/api/ai/chat", async (c) => {
  const user = await getUserFromToken(parseSessionCookie(c.req.header("cookie")));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
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

    // Determine which model to use
    let selectedModel: string;
    let selectedTier: '🌕' | '🌓' | '🌑';

    if (model && MODEL_CONFIGS[model]) {
      selectedModel = model;
      selectedTier = MODEL_CONFIGS[model].tier;
    } else if (tier && ['🌕', '🌓', '🌑'].includes(tier)) {
      selectedTier = tier;
      selectedModel = DEFAULT_MODELS[tier];
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
        return c.json({
          error: "quota_exceeded",
          tier: selectedTier,
          message: `${selectedTier} 额度已用完，请升级套餐或稍后再试`,
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

    const response = await routeAIRequest(request);

    // Record usage and cost
    if (response.usage) {
      recordUsage(user.id, response.usage.inputTokens, response.usage.outputTokens, response.usage.totalCostUSD);
    }
    recordUsageEvent(user.id, selectedTier, selectedModel);

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
    allProviders: ['openai', 'anthropic', 'google', 'kimi', 'minimax', 'qwen'],
  });
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