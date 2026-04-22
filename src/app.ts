import { Hono } from "hono";
import { db } from "./db";
import { authenticate } from "./auth";
import { parseRequest, type ChatMessage } from "./parser";
import { convertRequest } from "./convert";
import { callModel, callModelStream } from "./proxy";
import { recordUsage } from "./usage";
import { config } from "./config";

const plans = [
  {
    name: "入门",
    price: "¥9.9 / 月",
    fullMoon: "30 次 / 天",
    halfMoon: "200 次 / 天",
    newMoon: "不限",
  },
  {
    name: "普通",
    price: "¥39 / 月",
    fullMoon: "200 次 / 天",
    halfMoon: "1000 次 / 天",
    newMoon: "不限",
  },
  {
    name: "高级",
    price: "¥99 / 月",
    fullMoon: "1000 次 / 天",
    halfMoon: "5000 次 / 天",
    newMoon: "不限",
  },
] as const;

const modelTiers = [
  {
    tier: "L1",
    tierEmoji: "🌕",
    models: ["GPT", "Gemini", "Claude"],
    rule: "优先路由，额度按日计算",
  },
  {
    tier: "L2",
    tierEmoji: "🌓",
    models: ["Kimi", "MiniMax", "Qwen"],
    rule: "L1 额度耗尽后降级",
  },
  {
    tier: "L3",
    tierEmoji: "🌒",
    models: ["轻量模型", "快速模型", "低成本模型"],
    rule: "始终可用",
  },
] as const;

const app = new Hono();

function baseHtml(content: string) {
  const navScript = `<script>
    async function updateNav() {
      try {
        const res = await fetch('/api/dashboard');
        if (!res.ok) return;
        const navLinks = document.querySelector('nav .flex.items-center.gap-6');
        if (!navLinks) return;
        navLinks.innerHTML = '<a href="/" class="hover:text-[#d4c4a8] text-[#a0937d]">首页</a><a href="/pricing" class="hover:text-[#d4c4a8] text-[#a0937d]">套餐</a><a href="/dashboard" class="hover:text-[#d4c4a8] text-[#a0937d]">后台</a><button id="logout-btn" class="text-[#a0937d] hover:text-[#f5f5dc]">退出</button>';
        document.getElementById('logout-btn')?.addEventListener('click', async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/';
        });
      } catch (e) {}
    }
    updateNav();
  </script>`;

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
    ${navScript}
  </body>
</html>`;
}

function navbar(currentPath: string = "/", isLoggedIn: boolean = false) {
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
        ${isLoggedIn ? `
          <a href="/dashboard" class="hover:text-[#d4c4a8] ${currentPath === '/dashboard' ? 'text-[#f5f5dc] font-semibold' : 'text-[#a0937d]'}">后台</a>
          <button id="logout-btn" class="text-[#a0937d] hover:text-[#f5f5dc]">退出</button>
        ` : `
          <a href="/login" class="text-[#a0937d] hover:text-[#f5f5dc]">登录</a>
          <a href="/register" class="bg-[#f5f5dc] text-black px-4 py-2 rounded-full text-sm font-medium hover:bg-[#d4c4a8]">注册</a>
        `}
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
      <p class="mt-1">从 🌕 到 🌒，始终在线</p>
    </div>
  </footer>`;
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
        <p class="text-[#a0937d] text-lg mb-2">🌕 / 🌓 / 🌒</p>
        <p class="text-[#7a6f5d] max-w-xl mx-auto mb-8">
          优先使用 🌕，其次 🌓，🌒 不限。自动路由，始终在线。
        </p>
        <div class="flex gap-4 justify-center">
          <a href="/register" class="bg-[#f5f5dc] text-black px-6 py-3 rounded-full font-medium hover:bg-[#d4c4a8]">立即开始</a>
          <a href="/pricing" class="border border-[#f5f5dc] text-[#f5f5dc] px-6 py-3 rounded-full font-medium hover:bg-[#f5f5dc] hover:text-black">查看套餐</a>
        </div>
      </section>

      <!-- Tiers -->
      <section class="py-12">
        <h2 class="text-center text-[#f5f5dc] text-2xl font-bold mb-8">三层月相路由 🌙</h2>
        <div class="grid md:grid-cols-3 gap-6">
          ${modelTiers.map(tier => `
            <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 text-center">
              <div class="text-4xl mb-4">${tier.tierEmoji}</div>
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
            <div class="text-2xl mb-3">🌕 优先</div>
            <p class="text-[#a0937d] text-sm">复杂任务、编程、长文写作使用 GPT、Gemini、Claude 等顶级模型。</p>
          </div>
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="text-2xl mb-3">🌓 降级</div>
            <p class="text-[#a0937d] text-sm">日常任务、总结、改写、翻译使用 Kimi、MiniMax、Qwen 等高效模型。</p>
          </div>
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 md:col-span-2">
            <div class="text-2xl mb-3">🌒 兜底</div>
            <p class="text-[#a0937d] text-sm">聊天、续写、润色等基础任务使用轻量快速模型，不限量使用。</p>
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
                <li>🌒 ${plan.newMoon}</li>
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
            <div class="text-[#a0937d] text-sm mb-6">每月</div>
            <ul class="text-left text-[#a0937d] text-sm space-y-3 mb-8">
              <li class="flex items-center gap-2"><span>🌕</span> ${plan.fullMoon}</li>
              <li class="flex items-center gap-2"><span>🌓</span> ${plan.halfMoon}</li>
              <li class="flex items-center gap-2"><span>🌒</span> ${plan.newMoon}</li>
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
        <form id="login-form" class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" id="email" placeholder="your@email.com" required class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" id="password" placeholder="••••••••" required class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <button type="submit" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8]">登录</button>
        </form>

        <div id="message" class="mt-4 text-center text-sm hidden"></div>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          还没有账号？<a href="/register" class="text-[#f5f5dc] hover:underline">立即注册</a>
        </div>
      </div>
    </main>

    ${footer()}

    <script>
      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const message = document.getElementById('message');
        const btn = e.target.querySelector('button');

        btn.disabled = true;
        btn.textContent = '登录中...';
        message.classList.add('hidden');

        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();

          if (res.ok) {
            window.location.href = '/dashboard';
          } else {
            message.className = 'mt-4 text-center text-sm text-red-400';
            message.textContent = data.error || '登录失败';
          }
        } catch (err) {
          message.className = 'mt-4 text-center text-sm text-red-400';
          message.textContent = '网络错误';
        } finally {
          btn.disabled = false;
          btn.textContent = '登录';
        }
      });
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
        <form id="register-form" class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" id="email" placeholder="your@email.com" required class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" id="password" placeholder="设置密码" required minlength="6" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <button type="submit" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8]">注册</button>
        </form>

        <div id="message" class="mt-4 text-center text-sm hidden"></div>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          已有账号？<a href="/login" class="text-[#f5f5dc] hover:underline">立即登录</a>
        </div>
      </div>
    </main>

    ${footer()}

    <script>
      document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const message = document.getElementById('message');
        const btn = e.target.querySelector('button');

        btn.disabled = true;
        btn.textContent = '注册中...';
        message.classList.add('hidden');

        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();

          if (res.ok) {
            window.location.href = '/dashboard';
          } else {
            message.className = 'mt-4 text-center text-sm text-red-400';
            message.textContent = data.error || '注册失败';
          }
        } catch (err) {
          message.className = 'mt-4 text-center text-sm text-red-400';
          message.textContent = '网络错误';
        } finally {
          btn.disabled = false;
          btn.textContent = '注册';
        }
      });
    </script>
  `);
}

function dashboardPage() {
  return baseHtml(`
    ${navbar('/dashboard')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-[#f5f5dc]">用户后台 🌙</h1>
        <p id="user-email" class="text-[#a0937d]">加载中...</p>
      </div>

      <div id="dashboard-content" class="hidden">
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Current Plan -->
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <h2 class="text-[#f5f5dc] font-bold mb-4">当前套餐</h2>
            <div id="plan-name" class="text-[#a0937d] text-sm mb-4">-</div>
            <div id="plan-price" class="text-[#f5f5dc] text-2xl font-bold mb-1">-</div>
            <div id="plan-expires" class="text-[#7a6f5d] text-xs mb-6">-</div>
            <a href="/pricing" class="inline-block text-[#f5f5dc] text-sm hover:underline">升级套餐 →</a>
          </div>

          <!-- Usage -->
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <h2 class="text-[#f5f5dc] font-bold mb-4">今日用量</h2>
            <div class="space-y-3">
              <div>
                <div class="flex justify-between text-[#a0937d] text-sm mb-1">
                  <span>🌕</span>
                  <span id="l1-usage">0 / 30</span>
                </div>
                <div class="h-2 bg-black rounded-full overflow-hidden">
                  <div id="l1-bar" class="h-full bg-[#f5f5dc] rounded-full" style="width: 0%"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between text-[#a0937d] text-sm mb-1">
                  <span>🌓</span>
                  <span id="l2-usage">0 / 200</span>
                </div>
                <div class="h-2 bg-black rounded-full overflow-hidden">
                  <div id="l2-bar" class="h-full bg-[#d4c4a8] rounded-full" style="width: 0%"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between text-[#a0937d] text-sm mb-1">
                  <span>🌒</span>
                  <span>不限</span>
                </div>
              </div>
            </div>
          </div>

          <!-- API Key -->
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <h2 class="text-[#f5f5dc] font-bold mb-4">API Key</h2>
            <div class="bg-black border border-[#3d2f1f] rounded-lg p-3 mb-4">
              <code id="api-key-display" class="text-[#7a6f5d] text-xs break-all">-</code>
            </div>
            <div class="flex gap-3">
              <button id="copy-key-btn" class="text-[#f5f5dc] text-sm hover:underline">复制</button>
              <button id="regenerate-key-btn" class="text-[#a0937d] text-sm hover:text-[#f5f5dc]">重新生成</button>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <h2 class="text-[#f5f5dc] font-bold mb-4">快捷操作</h2>
            <div class="space-y-3">
              <a href="/pricing" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
                <span>💰</span> 升级套餐
              </a>
              <a href="#" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
                <span>📊</span> 使用统计
              </a>
              <a href="/api/docs" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
                <span>📝</span> API 文档
              </a>
              <a href="#" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
                <span>💬</span> 联系我们
              </a>
            </div>
          </div>
        </div>
      </div>

      <div id="login-prompt" class="hidden text-center py-12">
        <p class="text-[#a0937d] mb-4">请先登录</p>
        <a href="/login" class="bg-[#f5f5dc] text-black px-6 py-3 rounded-full font-medium hover:bg-[#d4c4a8]">登录</a>
      </div>
    </main>

    ${footer()}

    <script>
      const planNames = {
        entry: '入门版',
        basic: '普通版',
        premium: '高级版'
      };
      const planPrices = {
        entry: '¥9.9 / 月',
        basic: '¥39 / 月',
        premium: '¥99 / 月'
      };
      const planLimits = {
        entry: { L1: 30, L2: 200, L3: Infinity },
        basic: { L1: 200, L2: 1000, L3: Infinity },
        premium: { L1: 1000, L2: 5000, L3: Infinity }
      };

      async function loadDashboard() {
        try {
          const res = await fetch('/api/dashboard');
          if (!res.ok) throw new Error('Not logged in');

          const data = await res.json();
          document.getElementById('user-email').textContent = data.email;
          document.getElementById('dashboard-content').classList.remove('hidden');
          document.getElementById('login-prompt').classList.add('hidden');

          // Plan info
          if (data.subscription) {
            const plan = data.subscription.plan;
            document.getElementById('plan-name').textContent = planNames[plan] || plan;
            document.getElementById('plan-price').textContent = planPrices[plan] || '-';
            const expires = new Date(data.subscription.expires_at);
            document.getElementById('plan-expires').textContent = '到期时间：' + expires.toLocaleString('zh-CN');
          }

          // Usage
          const limits = planLimits[data.subscription?.plan] || planLimits.entry;
          const l1Used = data.usage?.L1 || 0;
          const l2Used = data.usage?.L2 || 0;
          document.getElementById('l1-usage').textContent = l1Used + ' / ' + limits.L1;
          document.getElementById('l1-bar').style.width = Math.min(100, (l1Used / limits.L1) * 100) + '%';
          document.getElementById('l2-usage').textContent = l2Used + ' / ' + limits.L2;
          document.getElementById('l2-bar').style.width = Math.min(100, (l2Used / limits.L2) * 100) + '%';

          // API Key
          if (data.apiKeys && data.apiKeys.length > 0) {
            document.getElementById('api-key-display').textContent = data.apiKeys[0].key;
          }
        } catch (err) {
          document.getElementById('login-prompt').classList.remove('hidden');
        }
      }

      document.getElementById('copy-key-btn').addEventListener('click', async () => {
        const key = document.getElementById('api-key-display').textContent;
        await navigator.clipboard.writeText(key);
        const btn = document.getElementById('copy-key-btn');
        btn.textContent = '已复制!';
        setTimeout(() => { btn.textContent = '复制'; }, 1500);
      });

      document.getElementById('regenerate-key-btn').addEventListener('click', async () => {
        if (!confirm('确定要重新生成 API Key 吗？旧 Key 将失效。')) return;
        const res = await fetch('/api/auth/regenerate-key', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          document.getElementById('api-key-display').textContent = data.apiKey;
          document.getElementById('copy-key-btn').textContent = '已复制!';
          setTimeout(() => { document.getElementById('copy-key-btn').textContent = '复制'; }, 1500);
        }
      });

      loadDashboard();
    </script>
  `);
}

app.get("/", (c) => c.html(moonPage()));
app.get("/pricing", (c) => c.html(pricingPage()));
app.get("/login", (c) => c.html(loginPage()));
app.get("/register", (c) => c.html(registerPage()));
app.get("/dashboard", (c) => c.html(dashboardPage()));
app.get("/admin/login", (c) => c.html(loginPage()));

app.get("/health", (c) =>
  c.json({
    ok: true,
    database: "ready",
  }),
);

app.get("/api/plans", (c) => c.json(plans));

app.get("/api/moon", (c) =>
  c.json({
    routing: ["L1", "L2", "L3"],
    tiers: modelTiers,
  }),
);

app.post("/api/auth/register", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "邮箱和密码不能为空" }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: "密码至少6位" }, 400);
    }

    const existing = db.query("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return c.json({ error: "邮箱已被注册" }, 409);
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    db.query("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(userId, email, passwordHash);

    const { createApiKey } = await import("./auth");
    const apiKey = createApiKey(userId, "L1");

    // Create 1-hour free trial subscription
    const subId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    db.query("INSERT INTO subscriptions (id, user_id, plan, status, expires_at) VALUES (?, ?, ?, ?, ?)").run(subId, userId, "entry", "active", expiresAt);

    // Create session
    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(sessionId, userId, sessionExpiresAt);

    c.header("Set-Cookie", `session=${sessionId}; Path=/; HttpOnly; Max-Age=${30 * 24 * 60 * 60}`);

    return c.json({ success: true, userId, apiKey });
  } catch (err: unknown) {
    console.error("Registration error:", err);
    return c.json({ error: "注册失败" }, 500);
  }
});

app.post("/api/auth/login", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "邮箱和密码不能为空" }, 400);
    }

    const user = db.query("SELECT id, password_hash FROM users WHERE email = ?").get(email) as { id: string; password_hash: string } | undefined;
    if (!user) {
      return c.json({ error: "邮箱或密码错误" }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: "邮箱或密码错误" }, 401);
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(sessionId, user.id, expiresAt);

    c.header("Set-Cookie", `session=${sessionId}; Path=/; HttpOnly; Max-Age=${30 * 24 * 60 * 60}`);

    return c.json({ success: true, userId: user.id });
  } catch (err: unknown) {
    console.error("Login error:", err);
    return c.json({ error: "登录失败" }, 500);
  }
});

app.post("/api/auth/logout", (c) => {
  const cookieHeader = c.req.header("cookie") || "";
  const match = cookieHeader.match(/session=([^;]+)/);
  if (match) {
    db.query("DELETE FROM sessions WHERE id = ?").run(match[1]);
  }
  c.header("Set-Cookie", "session=; Path=/; HttpOnly; Max-Age=0");
  return c.json({ success: true });
});

function getUserFromSession(c: any): { userId: string; email: string } | null {
  const cookieHeader = c.req.header("cookie") || "";
  const match = cookieHeader.match(/session=([^;]+)/);
  if (!match) return null;
  const sessionId = match[1];

  const session = db.query(`
    SELECT s.user_id, u.email FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).get(sessionId) as { user_id: string; email: string } | undefined;

  if (!session) return null;
  return { userId: session.user_id, email: session.email };
}

app.get("/api/dashboard", (c) => {
  const user = getUserFromSession(c);
  if (!user) {
    return c.json({ error: "未登录" }, 401);
  }

  // Get subscription
  const subscription = db.query(`
    SELECT plan, status, expires_at FROM subscriptions
    WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(user.userId) as { plan: string; status: string; expires_at: string } | undefined;

  // Get API keys
  const apiKeys = db.query(`
    SELECT key, tier, created_at FROM api_keys WHERE user_id = ?
  `).all(user.userId) as { key: string; tier: string; created_at: string }[];

  // Get usage today
  const today = new Date().toISOString().split("T")[0];
  const usage = db.query(`
    SELECT tier, COUNT(*) as count FROM usage_events
    WHERE user_id = ? AND date(created_at) = ?
    GROUP BY tier
  `).all(user.userId, today) as { tier: string; count: number }[];

  const usageMap: Record<string, number> = { L1: 0, L2: 0, L3: 0 };
  usage.forEach((u) => { usageMap[u.tier] = u.count; });

  return c.json({
    email: user.email,
    subscription,
    apiKeys,
    usage: usageMap,
  });
});

app.post("/api/auth/regenerate-key", async (c) => {
  const user = getUserFromSession(c);
  if (!user) {
    return c.json({ error: "未登录" }, 401);
  }

  const { createApiKey } = await import("./auth");
  const newKey = createApiKey(user.userId, "L1");

  return c.json({ apiKey: newKey });
});

// Simple password hashing using Web Crypto
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hash).toString("hex");
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

app.get("/api/stats", (c) => {
  const userCount = db.query("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  const subscriptionCount = db.query("SELECT COUNT(*) AS count FROM subscriptions").get() as { count: number };
  return c.json({
    users: userCount.count,
    subscriptions: subscriptionCount.count,
  });
});

// Shared handler for AI requests
async function handleAIRequest(c: any) {
  const auth = authenticate(c.req.header("Authorization"));
  if (!auth) {
    return c.json({ error: { message: "Invalid API key" } }, 401);
  }

  try {
    const body = await c.req.json();
    const parsed = parseRequest(body, auth.tier);

    const source = config[parsed.tier.toLowerCase() as "l1" | "l2" | "l3"];
    if (!source) {
      return c.json({ error: { message: `Tier ${parsed.tier} not configured` } }, 500);
    }

    // 流式响应
    if (parsed.stream) {
      const streamResponse = await callModelStream(source, body);
      recordUsage(auth.userId, parsed.tier, source.model);
      return new Response(streamResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
        },
      });
    }

    const converted = convertRequest(body, source.provider, source.model);
    const result = await callModel(source, converted.body);

    recordUsage(auth.userId, parsed.tier, source.model);

    if (!result.ok) {
      return c.json(result.data, result.status);
    }

    return c.json(result.data, result.status);
  } catch (err: unknown) {
    console.error("Request handling error:", err);
    return c.json({ error: { message: "Internal server error" } }, 500);
  }
}

// OpenAI 兼容路由
app.post("/v1/chat/completions", handleAIRequest);

// Anthropic 兼容路由
app.post("/v1/messages", handleAIRequest);

// Responses API (Codex) 路由
app.post("/v1/responses", handleResponsesRequest);

async function handleResponsesRequest(c: any) {
  const auth = authenticate(c.req.header("Authorization"));
  if (!auth) {
    return c.json({ error: { message: "Invalid API key" } }, 401);
  }

  try {
    const body = await c.req.json();
    const stream = body.stream === true;
    const model = body.model || "MiniMax-M2.7";

    // Build messages from input (Responses API format)
    let messages: ChatMessage[] = [];
    if (typeof body.input === "string") {
      messages = [{ role: "user", content: body.input }];
    } else if (Array.isArray(body.input)) {
      messages = body.input.map((item: any) => {
        if (item.type === "text") {
          return { role: "user", content: item.text };
        }
        return { role: "user", content: JSON.stringify(item) };
      });
    }

    // Determine tier from model
    let tier: "L1" | "L2" | "L3" = auth.tier;
    const source = config[tier.toLowerCase() as "l1" | "l2" | "l3"];
    if (!source) {
      return c.json({ error: { message: `Tier ${tier} not configured` } }, 500);
    }

    const requestBody = {
      model: source.model,
      messages,
      stream,
    };

    if (stream) {
      const streamResponse = await callModelStream(source, requestBody);
      recordUsage(auth.userId, tier, source.model);

      // Convert Anthropic SSE stream to Responses API format
      const encoder = new TextEncoder();
      const stream_body = streamResponse.body;
      let buffer = "";

      const readable = new ReadableStream({
        async start(controller) {
          const reader = stream_body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += new TextDecoder().decode(value);
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("event: ")) {
                  const eventType = line.slice(7).trim();
                  // Store event type for next data line
                  (controller as any)._lastEvent = eventType;
                } else if (line.startsWith("data: ")) {
                  const data = line.slice(6).trim();
                  if (data === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    continue;
                  }

                  const lastEvent = (controller as any)._lastEvent || "";
                  try {
                    const parsed = JSON.parse(data);

                    if (lastEvent === "content_block_delta") {
                      const delta = parsed.delta?.text || "";
                      if (delta) {
                        const response_event = {
                          type: "content_block_delta",
                          delta: { type: "text", text: delta },
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(response_event)}\n\n`));
                      }
                    } else if (lastEvent === "message_delta" && parsed.usage) {
                      // Final usage stats
                      const usage_event = { type: "message_delta", usage: parsed.usage, delta: parsed.delta };
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(usage_event)}\n\n`));
                    }
                  } catch {}
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    const converted = convertRequest({ ...body, messages }, source.provider, source.model);
    const result = await callModel(source, converted.body);
    recordUsage(auth.userId, tier, source.model);

    if (!result.ok) {
      return c.json(result.data, result.status);
    }

    // Convert response to Responses API format
    const response_data = {
      id: `resp_${crypto.randomUUID().slice(0, 8)}`,
      model: model,
      model_slug: model,
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: extractTextFromResponse(result.data),
        },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    };

    return c.json(response_data, result.status);
  } catch (err: unknown) {
    console.error("Responses request error:", err);
    return c.json({ error: { message: "Internal server error" } }, 500);
  }
}

function extractTextFromResponse(data: unknown): string {
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    // OpenAI format
    if (d.choices && Array.isArray(d.choices)) {
      const choice = d.choices[0] as Record<string, unknown>;
      if (choice.message) {
        const msg = choice.message as Record<string, unknown>;
        if (typeof msg.content === "string") return msg.content;
      }
      if (choice.delta) {
        const delta = choice.delta as Record<string, unknown>;
        if (typeof delta.content === "string") return delta.content;
      }
    }
    // Anthropic format: content is array with objects having type and text/thinking
    if (d.content && Array.isArray(d.content)) {
      const content = d.content as Array<Record<string, unknown>>;
      for (const block of content) {
        if (block.type === "text" && block.text) {
          return block.text as string;
        }
      }
    }
  }
  return "";
}

export default app;