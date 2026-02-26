// src/index.js

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API 路由处理 ---

    if (path === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }
    if (path === "/api/logout" && request.method === "POST") {
      return handleLogout();
    }
    // 获取书签
    if (path === "/api/bookmarks" && request.method === "GET") {
      return handleGetBookmarks(request, env);
    }
    // 添加书签
    if (path === "/api/bookmarks" && request.method === "POST") {
      return handleAddBookmark(request, env);
    }
    // 删除书签
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

const DEFAULT_PASSWORD = "admin888";

function isLoggedIn(request) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.includes("nav_auth=valid");
}

async function handleLogin(request, env) {
  try {
    const { password } = await request.json();
    const secret = env.PASSWORD || DEFAULT_PASSWORD;
    if (password === secret) {
      const cookie = "nav_auth=valid; Path=/; Max-Age=604800; SameSite=Lax";
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
  let data = await env.MY_BOOKMARKS.get("links", { type: "json" });
  if (!data) data = [];

  // 未登录用户只能看非私有且非空分类的（或者所有非私有的）
  if (!isAuth) {
    data = data.filter(item => !item.private);
  }
  
  // 提取所有唯一分类标签
  const categories = [...new Set(data.map(item => item.category).filter(Boolean))];

  return new Response(JSON.stringify({ 
    success: true, 
    data: data,
    categories: categories,
    isLoggedIn: isAuth
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

async function handleAddBookmark(request, env) {
  if (!isLoggedIn(request)) {
    return new Response(JSON.stringify({ success: false, message: "未授权" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  try {
    const { title, url, category, isPrivate } = await request.json();
    if (!title || !url) throw new Error("缺少参数");

    let data = await env.MY_BOOKMARKS.get("links", { type: "json" }) || [];
    
    const newLink = {
      id: Date.now().toString(),
      title,
      url: url.startsWith('http') ? url : `https://${url}`,
      category: category ? category.trim() : "未分类",
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
    return new Response(JSON.stringify({ success: false, message: "未授权" }), { status: 401, headers: { "Content-Type": "application/json" } });
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

async function handleHome(request, env) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>智能导航页</title>
  <style>
    :root { --bg: #f0f2f5; --card: #fff; --text: #333; --primary: #2563eb; --danger: #dc2626; --border: #e5e7eb; --tag-bg: #e0e7ff; --tag-text: #3730a3; }
    @media (prefers-color-scheme: dark) { --bg: #111827; --card: #1f2937; --text: #f3f4f6; --border: #374151; --tag-bg: #312e81; --tag-text: #c7d2fe; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 0; line-height: 1.5; }
    .container { max-width: 1000px; margin: 0 auto; padding: 20px; }
    
    /* Header & Search */
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
    h1 { margin: 0; font-size: 1.5rem; display: flex; align-items: center; gap: 10px; }
    
    .search-box { flex: 1; max-width: 500px; position: relative; display: flex; }
    .search-input { width: 100%; padding: 10px 15px; border-radius: 20px; border: 1px solid var(--border); background: var(--card); color: var(--text); outline: none; transition: 0.2s; }
    .search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
    .search-btn { position: absolute; right: 5px; top: 5px; bottom: 5px; background: var(--primary); color: white; border: none; border-radius: 15px; padding: 0 15px; cursor: pointer; }
    
    /* Auth Panel */
    .auth-panel { display: flex; gap: 10px; align-items: center; }
    .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 500; transition: 0.2s; font-size: 0.9rem; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .login-form { display: none; gap: 8px; }
    .login-form.active { display: flex; }
    .login-input { padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--text); width: 120px; }

    /* Categories */
    .categories { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 20px; scrollbar-width: thin; }
    .cat-tag { padding: 6px 14px; background: var(--card); border: 1px solid var(--border); border-radius: 20px; cursor: pointer; white-space: nowrap; font-size: 0.9rem; transition: 0.2s; user-select: none; }
    .cat-tag:hover { border-color: var(--primary); color: var(--primary); }
    .cat-tag.active { background: var(--primary); color: white; border-color: var(--primary); }

    /* Add Section */
    .add-section { background: var(--card); padding: 20px; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); display: none; border: 1px solid var(--border); }
    .add-section.visible { display: block; }
    .add-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
    .input-group { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 120px; }
    .input-group label { font-size: 0.8rem; opacity: 0.7; }
    .input-field { padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); width: 100%; box-sizing: border-box; }
    .checkbox-group { display: flex; align-items: center; gap: 5px; height: 38px; font-size: 0.9rem; }

    /* Grid */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
    .card { background: var(--card); padding: 15px; border-radius: 12px; text-decoration: none; color: inherit; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border); transition: transform 0.2s; position: relative; min-height: 100px; }
    .card:hover { transform: translateY(-3px); border-color: var(--primary); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .card-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px; }
    .card-title { font-weight: 600; font-size: 1rem; margin: 0; word-break: break-word; }
    .card-meta { font-size: 0.75rem; opacity: 0.6; margin-top: auto; display: flex; justify-content: space-between; align-items: center; }
    .badge { font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background: #fee2e2; color: #991b1b; }
    .dark .badge { background: #450a0a; color: #fca5a5; }
    .cat-label { background: var(--tag-bg); color: var(--tag-text); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; }
    
    .delete-btn { position: absolute; top: 8px; right: 8px; opacity: 0; transition: 0.2s; background: rgba(255,255,255,0.8); border: none; color: var(--danger); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-weight: bold; }
    .dark .delete-btn { background: rgba(0,0,0,0.5); color: #ff6b6b; }
    .card:hover .delete-btn { opacity: 1; }
    
    .empty-state { grid-column: 1/-1; text-align: center; padding: 40px; opacity: 0.6; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🧭 智能导航</h1>
      
      <!-- 搜索框 -->
      <form class="search-box" action="https://www.baidu.com/s" target="_blank" method="get">
        <input type="text" name="wd" class="search-input" placeholder="百度搜索..." required>
        <button type="submit" class="search-btn">搜</button>
      </form>

      <div class="auth-panel" id="authPanel"></div>
    </header>

    <!-- 分类标签 -->
    <div class="categories" id="categoryContainer">
      <!-- 动态生成 -->
    </div>

    <!-- 添加书签区域 -->
    <div class="add-section" id="addSection">
      <div class="add-row">
        <div class="input-group" style="flex: 2;">
          <label>标题</label>
          <input type="text" id="newTitle" class="input-field" placeholder="网站名称">
        </div>
        <div class="input-group" style="flex: 3;">
          <label>网址</label>
          <input type="text" id="newUrl" class="input-field" placeholder="example.com">
        </div>
        <div class="input-group" style="flex: 2;">
          <label>分类标签</label>
          <input type="text" id="newCategory" class="input-field" placeholder="如：工作、娱乐" list="catList">
          <datalist id="catList"></datalist>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="newPrivate">
          <label for="newPrivate">私有</label>
        </div>
        <button class="btn btn-primary" onclick="addBookmark()">添加</button>
      </div>
    </div>

    <!-- 书签列表 -->
    <div class="grid" id="bookmarkGrid">
      <div class="empty-state">加载中...</div>
    </div>
  </div>

  <script>
    let isLoggedIn = false;
    let allBookmarks = [];
    let allCategories = [];
    let currentFilter = '全部';

    async function init() {
      await loadBookmarks();
      updateAuthUI();
    }

    async function loadBookmarks() {
      const res = await fetch('/api/bookmarks');
      const json = await res.json();
      isLoggedIn = json.isLoggedIn;
      allBookmarks = json.data;
      allCategories = json.categories;

      renderCategories();
      renderBookmarks(); // 初始渲染全部
      updateAuthUI();
    }

    function renderCategories() {
      const container = document.getElementById('categoryContainer');
      const datalist = document.getElementById('catList');
      
      // 构建标签列表
      let html = \`<div class="cat-tag \${currentFilter === '全部' ? 'active' : ''}" onclick="filterCat('全部')">全部</div>\`;
      allCategories.forEach(cat => {
        html += \`<div class="cat-tag \${currentFilter === cat ? 'active' : ''}" onclick="filterCat('\${cat}')">\${cat}</div>\`;
      });
      container.innerHTML = html;

      // 填充 datalist 用于输入提示
      datalist.innerHTML = allCategories.map(c => \`<option value="\${c}">\`).join('');
    }

    function filterCat(cat) {
      currentFilter = cat;
      renderCategories(); // 更新激活状态
      renderBookmarks();
    }

    function renderBookmarks() {
      const grid = document.getElementById('bookmarkGrid');
      grid.innerHTML = '';

      // 过滤逻辑：分类 + (登录状态隐含在数据加载时已处理私有数据，这里只需过滤分类)
      const filtered = currentFilter === '全部' 
        ? allBookmarks 
        : allBookmarks.filter(b => b.category === currentFilter);

      if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state">暂无此分类书签</div>';
        return;
      }

      filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = \`
          <a href="\${item.url}" target="_blank" style="text-decoration:none; color:inherit; display:block; height:100%;">
            <div class="card-header">
              <h4 class="card-title">\${item.title}</h4>
              \${item.private ? '<span class="badge">私有</span>' : ''}
            </div>
            <div class="card-meta">
              <span class="cat-label">\${item.category}</span>
              <span style="font-size:0.7em; opacity:0.5">↗</span>
            </div>
          </a>
          \${isLoggedIn ? \`<button class="delete-btn" onclick="deleteBookmark('\${item.id}')">×</button>\` : ''}
        \`;
        grid.appendChild(card);
      });
    }

    function updateAuthUI() {
      const panel = document.getElementById('authPanel');
      const addSection = document.getElementById('addSection');

      if (isLoggedIn) {
        panel.innerHTML = \`
          <span style="font-size:0.9rem">👋 管理员</span>
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
          <button class="btn btn-primary" id="showLoginBtn" onclick="toggleLogin(true)">登录</button>
        \`;
        addSection.classList.remove('visible');
      }
    }

    function toggleLogin(show) {
      const form = document.getElementById('loginForm');
      const btn = document.getElementById('showLoginBtn');
      if (show) { form.classList.add('active'); btn.style.display = 'none'; } 
      else { form.classList.remove('active'); btn.style.display = 'block'; }
    }

    async function doLogin() {
      const pwd = document.getElementById('pwdInput').value;
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (data.success) window.location.reload();
      else alert(data.message);
    }

    async function doLogout() {
      await fetch('/api/logout', { method: 'POST' });
      window.location.reload();
    }

    async function addBookmark() {
      const title = document.getElementById('newTitle').value;
      const url = document.getElementById('newUrl').value;
      const category = document.getElementById('newCategory').value || '未分类';
      const isPrivate = document.getElementById('newPrivate').checked;

      if (!title || !url) return alert('请填写标题和网址');

      const res = await fetch('/api/bookmarks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url, category, isPrivate })
      });
      
      if ((await res.json()).success) {
        document.getElementById('newTitle').value = '';
        document.getElementById('newUrl').value = '';
        document.getElementById('newCategory').value = '';
        document.getElementById('newPrivate').checked = false;
        loadBookmarks(); // 重新加载以更新分类列表
      } else {
        alert('添加失败');
      }
    }

    async function deleteBookmark(id) {
      if (!confirm('确定删除？')) return;
      const res = await fetch('/api/bookmarks', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if ((await res.json()).success) loadBookmarks();
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
