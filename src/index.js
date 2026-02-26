// src/index.js

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API 路由处理 ---

    // 1. 登录
    if (path === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }

    // 2. 登出
    if (path === "/api/logout" && request.method === "POST") {
      return handleLogout();
    }

    // 3. 获取书签列表 (GET)
    if (path === "/api/bookmarks" && request.method === "GET") {
      return handleGetBookmarks(request, env);
    }

    // 4. 添加书签 (POST) - 仅限登录用户
    if (path === "/api/bookmarks" && request.method === "POST") {
      return handleAddBookmark(request, env);
    }

    // 5. 删除书签 (DELETE) - 仅限登录用户
    if (path === "/api/bookmarks" && request.method === "DELETE") {
      return handleDeleteBookmark(request, env);
    }

    // --- 页面路由 ---
    if (path === "/" || path === "") {
      return handleHome(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// --- 配置常量 ---
const DEFAULT_PASSWORD = "admin888"; // 默认密码，建议通过 wrangler secret put PASSWORD 覆盖

// --- 辅助函数：检查登录状态 ---
function isLoggedIn(request) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.includes("nav_auth=valid");
}

// --- API 处理逻辑 ---

async function handleLogin(request, env) {
  try {
    const { password } = await request.json();
    // 优先使用环境变量中的密码，否则使用默认值
    const secret = env.PASSWORD || DEFAULT_PASSWORD;

    if (password === secret) {
      const cookie = "nav_auth=valid; Path=/; Max-Age=604800; SameSite=Lax"; // 7天
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
      });
    }
    return new Response(JSON.stringify({ success: false, message: "密码错误" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: "无效请求" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function handleLogout() {
  const cookie = "nav_auth=; Path=/; Max-Age=0; SameSite=Lax";
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

async function handleGetBookmarks(request, env) {
  const isAuth = isLoggedIn(request);
  
  // 从 KV 读取数据，如果没有则返回空数组
  let data = await env.MY_BOOKMARKS.get("links", { type: "json" });
  if (!data) data = [];

  // 如果未登录，过滤掉 private 为 true 的书签
  if (!isAuth) {
    data = data.filter(item => !item.private);
  }

  return new Response(JSON.stringify({ 
    success: true, 
    data: data,
    isLoggedIn: isAuth
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

async function handleAddBookmark(request, env) {
  if (!isLoggedIn(request)) {
    return new Response(JSON.stringify({ success: false, message: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { title, url, isPrivate } = await request.json();
    if (!title || !url) throw new Error("缺少参数");

    let data = await env.MY_BOOKMARKS.get("links", { type: "json" }) || [];
    
    const newLink = {
      id: Date.now().toString(),
      title,
      url: url.startsWith('http') ? url : `https://${url}`,
      private: isPrivate === true,
      createdAt: new Date().toISOString()
    };

    data.push(newLink);
    await env.MY_BOOKMARKS.put("links", JSON.stringify(data));

    return new Response(JSON.stringify({ success: true, data: newLink }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleDeleteBookmark(request, env) {
  if (!isLoggedIn(request)) {
    return new Response(JSON.stringify({ success: false, message: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { id } = await request.json();
    let data = await env.MY_BOOKMARKS.get("links", { type: "json" }) || [];
    
    const newData = data.filter(item => item.id !== id);
    await env.MY_BOOKMARKS.put("links", JSON.stringify(newData));

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// --- 页面渲染 ---

async function handleHome(request, env) {
  const isAuth = isLoggedIn(request);
  
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>智能导航页</title>
  <style>
    :root { --bg: #f0f2f5; --card: #fff; --text: #333; --primary: #2563eb; --danger: #dc2626; --border: #e5e7eb; }
    @media (prefers-color-scheme: dark) { --bg: #111827; --card: #1f2937; --text: #f3f4f6; --border: #374151; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; line-height: 1.5; }
    .container { max-width: 900px; margin: 0 auto; }
    
    /* Header */
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; flex-wrap: wrap; gap: 15px; }
    h1 { margin: 0; font-size: 1.5rem; display: flex; align-items: center; gap: 10px; }
    
    /* Auth Panel */
    .auth-panel { display: flex; gap: 10px; align-items: center; }
    .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 500; transition: 0.2s; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-danger { background: var(--danger); color: white; font-size: 0.8rem; padding: 4px 8px; }
    
    /* Login Modal/Form */
    .login-form { display: none; gap: 8px; }
    .login-form.active { display: flex; }
    .login-input { padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--text); }

    /* Add Bookmark Section */
    .add-section { background: var(--card); padding: 20px; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); display: none; }
    .add-section.visible { display: block; }
    .add-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
    .input-group { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 150px; }
    .input-group label { font-size: 0.85rem; opacity: 0.8; }
    .input-field { padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); width: 100%; box-sizing: border-box;}
    .checkbox-group { display: flex; align-items: center; gap: 5px; height: 42px; }

    /* Grid */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
    .card { background: var(--card); padding: 15px; border-radius: 12px; text-decoration: none; color: inherit; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border); transition: transform 0.2s; position: relative; }
    .card:hover { transform: translateY(-3px); border-color: var(--primary); }
    .card-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px; }
    .card-title { font-weight: 600; font-size: 1.05rem; margin: 0; }
    .card-url { font-size: 0.8rem; opacity: 0.6; word-break: break-all; }
    .badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: #fee2e2; color: #991b1b; }
    .dark .badge { background: #450a0a; color: #fca5a5; }
    
    .delete-btn { position: absolute; top: 10px; right: 10px; opacity: 0; transition: 0.2s; }
    .card:hover .delete-btn { opacity: 1; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🧭 智能导航</h1>
      <div class="auth-panel" id="authPanel">
        <!-- 动态内容 -->
      </div>
    </header>

    <!-- 添加书签区域 (仅登录可见) -->
    <div class="add-section" id="addSection">
      <h3 style="margin-top:0">➕ 添加新书签</h3>
      <div class="add-row">
        <div class="input-group">
          <label>标题</label>
          <input type="text" id="newTitle" class="input-field" placeholder="例如：Google">
        </div>
        <div class="input-group">
          <label>网址</label>
          <input type="text" id="newUrl" class="input-field" placeholder="google.com">
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="newPrivate">
          <label for="newPrivate">私有 (仅自己可见)</label>
        </div>
        <button class="btn btn-primary" onclick="addBookmark()">保存</button>
      </div>
    </div>

    <!-- 书签列表 -->
    <div class="grid" id="bookmarkGrid">
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; opacity: 0.6;">加载中...</div>
    </div>
  </div>

  <script>
    let isLoggedIn = false;

    // 初始化
    async function init() {
      await loadBookmarks();
      updateAuthUI();
    }

    // 加载书签
    async function loadBookmarks() {
      const res = await fetch('/api/bookmarks');
      const json = await res.json();
      isLoggedIn = json.isLoggedIn;
      
      const grid = document.getElementById('bookmarkGrid');
      grid.innerHTML = '';

      if (json.data.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; opacity: 0.6;">暂无书签，登录后添加一些吧！</div>';
        return;
      }

      json.data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = \`
          <a href="\${item.url}" target="_blank" style="text-decoration:none; color:inherit; display:block; height:100%;">
            <div class="card-header">
              <h4 class="card-title">\${item.title} \${item.private ? '<span class="badge">私有</span>' : ''}</h4>
            </div>
            <div class="card-url">\${item.url}</div>
          </a>
          \${isLoggedIn ? \`<button class="btn btn-danger delete-btn" onclick="deleteBookmark('\${item.id}')">×</button>\` : ''}
        \`;
        grid.appendChild(card);
      });

      updateAuthUI();
    }

    // 更新 UI 状态
    function updateAuthUI() {
      const panel = document.getElementById('authPanel');
      const addSection = document.getElementById('addSection');

      if (isLoggedIn) {
        panel.innerHTML = \`
          <span>👋 管理员</span>
          <button class="btn btn-outline" onclick="doLogout()">退出</button>
        \`;
        addSection.classList.add('visible');
      } else {
        panel.innerHTML = \`
          <div class="login-form" id="loginForm">
            <input type="password" id="pwdInput" class="login-input" placeholder="密码">
            <button class="btn btn-primary" onclick="doLogin()">登录</button>
            <button class="btn btn-outline" onclick="toggleLogin(false)">取消</button>
          </div>
          <button class="btn btn-primary" id="showLoginBtn" onclick="toggleLogin(true)">管理员登录</button>
        \`;
        addSection.classList.remove('visible');
      }
    }

    function toggleLogin(show) {
      const form = document.getElementById('loginForm');
      const btn = document.getElementById('showLoginBtn');
      if (show) {
        form.classList.add('active');
        btn.style.display = 'none';
      } else {
        form.classList.remove('active');
        btn.style.display = 'block';
      }
    }

    async function doLogin() {
      const pwd = document.getElementById('pwdInput').value;
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (data.success) {
        window.location.reload();
      } else {
        alert(data.message);
      }
    }

    async function doLogout() {
      await fetch('/api/logout', { method: 'POST' });
      window.location.reload();
    }

    async function addBookmark() {
      const title = document.getElementById('newTitle').value;
      const url = document.getElementById('newUrl').value;
      const isPrivate = document.getElementById('newPrivate').checked;

      if (!title || !url) return alert('请填写完整信息');

      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url, isPrivate })
      });
      
      if ((await res.json()).success) {
        document.getElementById('newTitle').value = '';
        document.getElementById('newUrl').value = '';
        document.getElementById('newPrivate').checked = false;
        loadBookmarks();
      } else {
        alert('添加失败');
      }
    }

    async function deleteBookmark(id) {
      if (!confirm('确定删除此书签？')) return;
      const res = await fetch('/api/bookmarks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if ((await res.json()).success) {
        loadBookmarks();
      }
    }

    init();
  </script>
</body>
</html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}
