import { Hono } from "hono";
import { db } from "./db";

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
    tier: "满月",
    tierEmoji: "🌕",
    models: ["GPT", "Gemini", "Claude"],
    rule: "优先路由，额度按日计算",
  },
  {
    tier: "半月",
    tierEmoji: "🌓",
    models: ["Kimi", "MiniMax", "Qwen"],
    rule: "满月耗尽后降级",
  },
  {
    tier: "新月",
    tierEmoji: "🌑",
    models: ["轻量模型", "快速模型", "低成本模型"],
    rule: "始终可用",
  },
] as const;

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
        <a href="/dashboard" class="hover:text-[#d4c4a8] ${currentPath === '/dashboard' ? 'text-[#f5f5dc] font-semibold' : 'text-[#a0937d]'}">后台</a>
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
      <p class="mt-1">从满月到新月，始终在线</p>
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
        <p class="text-[#a0937d] text-lg mb-2">🌕 满月 / 🌓 半月 / 🌑 新月</p>
        <p class="text-[#7a6f5d] max-w-xl mx-auto mb-8">
          优先使用满月模型，其次半月模型，新月不限。自动路由，始终在线。
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
            <div class="text-2xl mb-3">🌕 满月优先</div>
            <p class="text-[#a0937d] text-sm">复杂任务、编程、长文写作使用 GPT、Gemini、Claude 等顶级模型。</p>
          </div>
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="text-2xl mb-3">🌓 半月降级</div>
            <p class="text-[#a0937d] text-sm">日常任务、总结、改写、翻译使用 Kimi、MiniMax、Qwen 等高效模型。</p>
          </div>
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 md:col-span-2">
            <div class="text-2xl mb-3">🌑 新月兜底</div>
            <p class="text-[#a0937d] text-sm">聊天、续写、润色等基础任务使用轻量快速模型，新月时段不限量使用。</p>
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
            <div class="text-[#a0937d] text-sm mb-6">每月</div>
            <ul class="text-left text-[#a0937d] text-sm space-y-3 mb-8">
              <li class="flex items-center gap-2"><span>🌕</span> 满月 ${plan.fullMoon}</li>
              <li class="flex items-center gap-2"><span>🌓</span> 半月 ${plan.halfMoon}</li>
              <li class="flex items-center gap-2"><span>🌑</span> 新月 ${plan.newMoon}</li>
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
        <form class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" placeholder="••••••••" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
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
        <form class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" placeholder="设置密码" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
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

function dashboardPage() {
  return baseHtml(`
    ${navbar('/dashboard')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-[#f5f5dc]">用户后台 🌙</h1>
        <p class="text-[#a0937d]">管理你的账户和订阅</p>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <!-- Current Plan -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">当前套餐</h2>
          <div class="text-[#a0937d] text-sm mb-4">入门版</div>
          <div class="text-[#f5f5dc] text-2xl font-bold mb-1">¥9.9 / 月</div>
          <div class="text-[#7a6f5d] text-xs mb-6">下次扣款日期：2026-05-21</div>
          <a href="/pricing" class="inline-block text-[#f5f5dc] text-sm hover:underline">升级套餐 →</a>
        </div>

        <!-- Usage -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">今日用量</h2>
          <div class="space-y-3">
            <div>
              <div class="flex justify-between text-[#a0937d] text-sm mb-1">
                <span>🌕 满月</span>
                <span>12 / 30</span>
              </div>
              <div class="h-2 bg-black rounded-full overflow-hidden">
                <div class="h-full bg-[#f5f5dc] rounded-full" style="width: 40%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-[#a0937d] text-sm mb-1">
                <span>🌓 半月</span>
                <span>45 / 200</span>
              </div>
              <div class="h-2 bg-black rounded-full overflow-hidden">
                <div class="h-full bg-[#d4c4a8] rounded-full" style="width: 22%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-[#a0937d] text-sm mb-1">
                <span>🌑 新月</span>
                <span>不限</span>
              </div>
            </div>
          </div>
        </div>

        <!-- API Key -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">API Key</h2>
          <div class="bg-black border border-[#3d2f1f] rounded-lg p-3 mb-4">
            <code class="text-[#7a6f5d] text-xs break-all">moon_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>
          </div>
          <button class="text-[#f5f5dc] text-sm hover:underline">重新生成 Key</button>
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
            <a href="#" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>📝</span> API 文档
            </a>
            <a href="#" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>💬</span> 联系我们
            </a>
          </div>
        </div>
      </div>
    </main>

    ${footer()}
  `);
}

app.get("/", (c) => c.html(moonPage()));
app.get("/pricing", (c) => c.html(pricingPage()));
app.get("/login", (c) => c.html(loginPage()));
app.get("/register", (c) => c.html(registerPage()));
app.get("/dashboard", (c) => c.html(dashboardPage()));

app.get("/health", (c) =>
  c.json({
    ok: true,
    database: "ready",
  }),
);

app.get("/api/plans", (c) => c.json(plans));

app.get("/api/moon", (c) =>
  c.json({
    routing: ["满月", "半月", "新月"],
    tiers: modelTiers,
  }),
);

app.get("/api/stats", (c) => {
  const userCount = db.query("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  const subscriptionCount = db.query("SELECT COUNT(*) AS count FROM subscriptions").get() as { count: number };
  return c.json({
    users: userCount.count,
    subscriptions: subscriptionCount.count,
  });
});

export default app;