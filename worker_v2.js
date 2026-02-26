// src/index.js

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/login" && request.method === "POST") return handleLogin(request, env);
    if (path === "/api/logout" && request.method === "POST") return handleLogout();
    if (path === "/api/bookmarks" && request.method === "GET") return handleGetBookmarks(request, env);
    if (path === "/api/bookmarks" && request.method === "POST") return handleAddBookmark(request, env);
    if (path === "/api/bookmarks" && request.method === "DELETE") return handleDeleteBookmark(request, env);

    if (path === "/" || path === "") return handleHome(request, env);

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
      status: 401, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: "无效请求" }), {
      status: 400, headers: { "Content-Type": "application/json" },
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
  if (!isAuth) data = data.filter(item => !item.private);
  const categories = [...new Set(data.map(item => item.category).filter(Boolean))];
  return new Response(JSON.stringify({ success: true, data, categories, isLoggedIn: isAuth }), {
    headers: { "Content-Type": "application/json" }
  });
}

async function handleAddBookmark(request, env) {
  if (!isLoggedIn(request)) return new Response(JSON.stringify({ success: false, message: "未授权" }), { status: 401, headers: { "Content-Type": "application/json" } });
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
    return new Response(JSON.stringify({ success: true, data: newLink }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
}

async function handleDeleteBookmark(request, env) {
  if (!isLoggedIn(request)) return new Response(JSON.stringify({ success: false, message: "未授权" }), { status: 401, headers: { "Content-Type": "application/json" } });
  try {
    const { id } = await request.json();
    let data = await env.MY_BOOKMARKS.get("links", { type: "json" }) || [];
    await env.MY_BOOKMARKS.put("links", JSON.stringify(data.filter(item => item.id !== id)));
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
}

async function handleHome(request, env) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"/>
  <title>智能导航页</title>
  <style>
    :root { 
      --bg: #f0f2f5; --card: #fff; --text: #333; --primary: #2563eb; --danger: #dc2626; --border: #e5e7eb; 
      --tag-bg: #e0e7ff; --tag-text: #3730a3; --shadow: 0 4px 12px rgba(0,0,0,0.05); 
      /* 动态变量，由 JS 控制 */
      --overlay-opacity: 0.6;
      --bg-blur: 8px;
      --safe-area-top: env(safe-area-inset-top, 20px);
    }
    @media (prefers-color-scheme: dark) { 
      --bg: #111827; --card: #1f2937; --text: #f3f4f6; --border: #374151; --tag-bg: #312e81; --tag-text: #c7d2fe; --shadow: 0 4px 12px rgba(0,0,0,0.3); 
    }
    
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 0; line-height: 1.5; overflow-x: hidden; min-height: 100vh; }
    
    /* --- 背景层 --- */
    #global-bg-layer {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background-size: cover; background-position: center; background-repeat: no-repeat;
      z-index: -1; transition: opacity 0.4s ease;
      opacity: 0; pointer-events: none;
    }
    #global-bg-layer.active { opacity: 1; }
    
    #global-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      /* 使用动态变量控制透明度和模糊 */
      background: rgba(0, 0, 0, var(--overlay-opacity)); 
      backdrop-filter: blur(var(--bg-blur)); 
      -webkit-backdrop-filter: blur(var(--bg-blur));
      z-index: -1; transition: background 0.2s ease, backdrop-filter 0.2s ease;
      opacity: 0; pointer-events: none;
    }
    #global-overlay.active { opacity: 1; }

    .container { max-width: 1000px; margin: 0 auto; padding: 20px; position: relative; z-index: 1; }
    
    /* --- 通用组件 --- */
    .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 500; transition: 0.2s; font-size: 0.9rem; display: inline-flex; align-items: center; justify-content: center; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-icon { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; cursor: pointer; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); transition: 0.2s; font-size: 1.2rem; }
    .btn-icon:hover { background: rgba(255,255,255,0.3); transform: scale(1.1); }

    /* --- 顶部导航栏 --- */
    .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
    .top-bar h1 { margin: 0; font-size: 1.5rem; display: flex; align-items: center; gap: 10px; }
    .auth-panel { display: flex; gap: 10px; align-items: center; }
    .login-form { display: none; gap: 8px; }
    .login-form.active { display: flex; }
    .login-input { padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--text); width: 120px; }
    .mini-search-box { flex: 1; max-width: 400px; position: relative; display: flex; min-width: 200px; }
    .mini-search-input { width: 100%; padding: 8px 15px; border-radius: 20px; border: 1px solid var(--border); background: var(--card); color: var(--text); outline: none; }
    .mini-search-btn { position: absolute; right: 5px; top: 4px; bottom: 4px; background: var(--primary); color: white; border: none; border-radius: 15px; padding: 0 12px; cursor: pointer; }

    /* --- 分类与书签 --- */
    .categories { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 20px; scrollbar-width: thin; }
    .cat-tag { padding: 6px 14px; background: var(--card); border: 1px solid var(--border); border-radius: 20px; cursor: pointer; white-space: nowrap; font-size: 0.9rem; transition: 0.2s; }
    .cat-tag.active { background: var(--primary); color: white; border-color: var(--primary); }
    .add-section { background: var(--card); padding: 20px; border-radius: 12px; margin-bottom: 25px; box-shadow: var(--shadow); display: none; border: 1px solid var(--border); }
    .add-section.visible { display: block; }
    .add-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
    .input-group { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 120px; }
    .input-group label { font-size: 0.8rem; opacity: 0.7; }
    .input-field { padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); width: 100%; box-sizing: border-box; font-size: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
    .card { background: var(--card); padding: 15px; border-radius: 12px; text-decoration: none; color: inherit; display: flex; flex-direction: column; border: 1px solid var(--border); transition: transform 0.2s; position: relative; min-height: 100px; }
    .card:hover { transform: translateY(-3px); border-color: var(--primary); }
    .card-title { font-weight: 600; font-size: 1rem; margin: 0 0 8px 0; word-break: break-word; }
    .card-meta { font-size: 0.75rem; opacity: 0.6; display: flex; justify-content: space-between; align-items: center; margin-top: auto; }
    .badge { font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background: #fee2e2; color: #991b1b; }
    .cat-label { background: var(--tag-bg); color: var(--tag-text); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; }
    .delete-btn { position: absolute; top: 8px; right: 8px; opacity: 0; background: rgba(255,255,255,0.8); border: none; color: var(--danger); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .card:hover .delete-btn { opacity: 1; }
    .empty-state { grid-column: 1/-1; text-align: center; padding: 40px; opacity: 0.6; }

    /* --- 搜索模式 --- */
    #search-mode-container {
      display: none; flex-direction: column; align-items: center; justify-content: center;
      min-height: 90vh; text-align: center; animation: fadeIn 0.5s ease; position: relative; z-index: 10; width: 100%;
    }
    .clock-widget { margin-bottom: 30px; color: white; text-shadow: 0 2px 10px rgba(0,0,0,0.5); width: 100%; }
    .clock-time { font-size: 6rem; font-weight: 200; letter-spacing: 2px; line-height: 1; margin: 0; }
    .clock-date { font-size: 1.4rem; opacity: 0.9; margin-top: 10px; font-weight: 300; }
    .big-search-box { position: relative; width: 100%; max-width: 600px; padding: 0 20px; }
    .big-search-input {
      width: 100%; padding: 20px 30px; font-size: 1.2rem; border-radius: 50px; border: 1px solid rgba(255,255,255,0.3);
      background: rgba(255, 255, 255, 0.95); color: #333; box-shadow: 0 8px 32px rgba(0,0,0,0.2); 
      outline: none; transition: 0.3s; box-sizing: border-box; backdrop-filter: blur(10px);
    }
    .big-search-input:focus { transform: scale(1.02); background: #fff; border-color: var(--primary); }
    
    .settings-trigger { margin-top: 25px; }
    
    /* --- 设置弹窗 --- */
    .modal-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
      z-index: 2000; display: none; justify-content: center; align-items: flex-end;
      opacity: 0; transition: opacity 0.3s;
    }
    .modal-overlay.active { display: flex; opacity: 1; }
    
    .settings-panel {
      background: rgba(30, 30, 30, 0.85);
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      width: 100%; max-width: 500px;
      border-radius: 20px 20px 0 0;
      padding: 25px;
      color: white;
      transform: translateY(100%);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
      margin-bottom: 0;
    }
    @media (min-width: 600px) {
      .modal-overlay { align-items: center; }
      .settings-panel { border-radius: 20px; margin-bottom: 20px; transform: translateY(20px) scale(0.95); }
    }
    .modal-overlay.active .settings-panel { transform: translateY(0) scale(1); }

    .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; }
    .panel-title { font-size: 1.1rem; font-weight: 600; margin: 0; }
    .close-modal { background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; opacity: 0.7; }
    .close-modal:hover { opacity: 1; }

    .setting-item { margin-bottom: 20px; }
    .setting-label { display: block; font-size: 0.9rem; opacity: 0.8; margin-bottom: 10px; }
    
    .bg-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .bg-option-btn {
      background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
      color: white; padding: 10px; border-radius: 10px; cursor: pointer; font-size: 0.85rem;
      transition: 0.2s; text-align: center;
    }
    .bg-option-btn:hover { background: rgba(255,255,255,0.2); }
    .bg-option-btn.active { background: var(--primary); border-color: var(--primary); }

    .custom-url-input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: white; margin-top: 10px; display: none; }
    .custom-url-input.visible { display: block; }

    .slider-container { display: flex; align-items: center; gap: 15px; }
    .slider { flex: 1; -webkit-appearance: none; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none; }
    .slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: white; border-radius: 50%; cursor: pointer; }
    .slider-value { width: 45px; text-align: right; font-size: 0.85rem; font-variant-numeric: tabular-nums; opacity: 0.9; }

    .mode-switcher { position: fixed; top: calc(var(--safe-area-top) + 10px); right: 20px; z-index: 1000; }
    .mode-btn { background: var(--card); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 20px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 6px; box-shadow: var(--shadow); }
    
    .hidden { display: none !important; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    @media (max-width: 768px) {
      .container { padding: 15px; }
      .top-bar h1 { font-size: 1.2rem; }
      .mini-search-box { order: 3; width: 100%; max-width: none; margin-top: 10px; }
      .grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .add-row { flex-direction: column; }
      .input-group { min-width: 100%; }
      
      #search-mode-container { min-height: 100vh; padding-top: 15vh; }
      .clock-time { font-size: 3.5rem; }
      .clock-date { font-size: 1rem; }
      .big-search-input { padding: 16px 20px; font-size: 16px; }
      
      .mode-switcher { top: calc(var(--safe-area-top) + 10px); right: 15px; }
      .mode-btn span#modeText { display: none; }
      .mode-btn { padding: 8px; border-radius: 50%; }
    }
    @media (max-width: 380px) {
      .grid { grid-template-columns: 1fr; }
      .clock-time { font-size: 3rem; }
      .bg-options { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  <div id="global-bg-layer"></div>
  <div id="global-overlay"></div>

  <div class="mode-switcher">
    <button class="mode-btn" onclick="toggleMode()">
      <span id="modeIcon">🔍</span> <span id="modeText">搜索模式</span>
    </button>
  </div>

  <!-- === 书签模式 === -->
  <div id="bookmark-mode-container" class="container">
    <header class="top-bar">
      <h1>🧭 智能导航</h1>
      <form class="mini-search-box" action="https://www.baidu.com/s" target="_blank" method="get">
        <input type="text" name="wd" class="mini-search-input" placeholder="百度搜索..." required>
        <button type="submit" class="mini-search-btn">搜</button>
      </form>
      <div class="auth-panel" id="authPanel"></div>
    </header>
    <div class="categories" id="categoryContainer"></div>
    <div class="add-section" id="addSection">
      <div class="add-row">
        <div class="input-group"><label>标题</label><input type="text" id="newTitle" class="input-field" placeholder="网站名称"></div>
        <div class="input-group"><label>网址</label><input type="text" id="newUrl" class="input-field" placeholder="example.com"></div>
        <div class="input-group"><label>分类</label><input type="text" id="newCategory" class="input-field" placeholder="如：工作" list="catList"><datalist id="catList"></datalist></div>
        <div class="checkbox-group"><input type="checkbox" id="newPrivate"><label for="newPrivate">私有</label></div>
        <button class="btn btn-primary" onclick="addBookmark()">添加</button>
      </div>
    </div>
    <div class="grid" id="bookmarkGrid"><div class="empty-state">加载中...</div></div>
  </div>

  <!-- === 搜索模式 === -->
  <div id="search-mode-container">
    <div class="clock-widget">
      <h1 class="clock-time" id="clockTime">00:00</h1>
      <div class="clock-date" id="clockDate">加载日期...</div>
    </div>
    
    <form class="big-search-box" action="https://www.baidu.com/s" target="_blank" method="get">
      <input type="text" name="wd" class="big-search-input" placeholder="输入搜索内容..." autofocus required>
    </form>
    
    <div class="settings-trigger">
      <button class="btn-icon" onclick="openSettings()" aria-label="背景设置">⚙️</button>
    </div>
  </div>

  <!-- === 设置弹窗 === -->
  <div class="modal-overlay" id="settingsModal" onclick="if(event.target === this) closeSettings()">
    <div class="settings-panel">
      <div class="panel-header">
        <h3 class="panel-title">背景设置</h3>
        <button class="close-modal" onclick="closeSettings()">×</button>
      </div>

      <div class="setting-item">
        <label class="setting-label">壁纸来源</label>
        <div class="bg-options">
          <div class="bg-option-btn active" id="opt-bing" onclick="selectBgSource('bing')">🌅 每日必应</div>
          <div class="bg-option-btn" id="opt-random" onclick="selectBgSource('random')">🏔️ 随机风景</div>
          <div class="bg-option-btn" id="opt-custom" onclick="selectBgSource('custom')">🔗 自定义</div>
        </div>
        <input type="text" id="customUrlInput" class="custom-url-input" placeholder="输入图片 URL" onkeydown="if(event.key==='Enter') applyCustomBg()">
      </div>

      <!-- 新增：模糊度控制 -->
      <div class="setting-item">
        <label class="setting-label">背景模糊 (毛玻璃)</label>
        <div class="slider-container">
          <span style="font-size:0.8rem">清晰</span>
          <input type="range" min="0" max="20" step="1" value="8" class="slider" id="blurSlider" oninput="updateBlur(this.value)">
          <span style="font-size:0.8rem">模糊</span>
          <span class="slider-value" id="blurValue">8px</span>
        </div>
      </div>

      <!-- 原有：暗度控制 -->
      <div class="setting-item">
        <label class="setting-label">背景暗度 (遮罩)</label>
        <div class="slider-container">
          <span style="font-size:0.8rem">亮</span>
          <input type="range" min="0" max="0.9" step="0.05" value="0.6" class="slider" id="overlaySlider" oninput="updateOverlay(this.value)">
          <span style="font-size:0.8rem">暗</span>
          <span class="slider-value" id="overlayValue">60%</span>
        </div>
      </div>

      <div class="setting-item" style="margin-bottom: 0;">
        <button class="bg-option-btn" style="width: 100%; background: rgba(220, 38, 38, 0.3); border-color: rgba(220, 38, 38, 0.5);" onclick="disableBg()">❌ 关闭背景 (纯色)</button>
      </div>
    </div>
  </div>

  <script>
    let isLoggedIn = false;
    let allBookmarks = [];
    let allCategories = [];
    let currentFilter = '全部';
    let isSearchMode = false;
    let clockInterval = null;
    
    // 默认配置：增加了 blur 字段
    let bgConfig = { type: 'bing', url: '', overlay: 0.6, blur: 8 };

    async function init() {
      if (localStorage.getItem('nav_mode') === 'search') isSearchMode = true;
      const savedCfg = localStorage.getItem('nav_bg_config_v3'); // 版本号升级，避免旧配置冲突
      if (savedCfg) {
        const parsed = JSON.parse(savedCfg);
        // 兼容旧配置
        bgConfig = { ...bgConfig, ...parsed };
      }
      
      applyBackgroundSettings();
      applyModeUI();
      await loadBookmarks();
      updateAuthUI();
    }

    function toggleMode() {
      isSearchMode = !isSearchMode;
      localStorage.setItem('nav_mode', isSearchMode ? 'search' : 'bookmark');
      applyModeUI();
    }

    function applyModeUI() {
      const bookmarkContainer = document.getElementById('bookmark-mode-container');
      const searchContainer = document.getElementById('search-mode-container');
      const modeText = document.getElementById('modeText');
      const modeIcon = document.getElementById('modeIcon');
      const bgLayer = document.getElementById('global-bg-layer');
      const overlay = document.getElementById('global-overlay');

      if (isSearchMode) {
        bookmarkContainer.classList.add('hidden');
        searchContainer.style.display = 'flex';
        modeText.textContent = "书签模式";
        modeIcon.textContent = "📑";
        bgLayer.classList.add('active');
        overlay.classList.add('active');
        startClock();
        if (window.innerWidth > 768) setTimeout(() => document.querySelector('.big-search-input').focus(), 100);
      } else {
        searchContainer.style.display = 'none';
        bookmarkContainer.classList.remove('hidden');
        modeText.textContent = "搜索模式";
        modeIcon.textContent = "🔍";
        bgLayer.classList.remove('active');
        overlay.classList.remove('active');
        stopClock();
      }
    }

    // --- 设置面板逻辑 ---
    function openSettings() {
      const modal = document.getElementById('settingsModal');
      modal.classList.add('active');
      updateSettingsUI();
    }

    function closeSettings() {
      document.getElementById('settingsModal').classList.remove('active');
    }

    function updateSettingsUI() {
      document.querySelectorAll('.bg-option-btn').forEach(b => b.classList.remove('active'));
      if(bgConfig.type !== 'none') {
         const btn = document.getElementById('opt-' + bgConfig.type);
         if(btn) btn.classList.add('active');
      }

      const input = document.getElementById('customUrlInput');
      if (bgConfig.type === 'custom') {
        input.classList.add('visible');
        input.value = bgConfig.url || '';
      } else {
        input.classList.remove('visible');
      }

      // 更新模糊滑块
      const blurSlider = document.getElementById('blurSlider');
      const blurVal = document.getElementById('blurValue');
      blurSlider.value = bgConfig.blur;
      blurVal.textContent = bgConfig.blur + 'px';

      // 更新暗度滑块
      const overlaySlider = document.getElementById('overlaySlider');
      const overlayVal = document.getElementById('overlayValue');
      overlaySlider.value = bgConfig.overlay;
      overlayVal.textContent = Math.round(bgConfig.overlay * 100) + '%';
    }

    function selectBgSource(type) {
      bgConfig.type = type;
      if (type === 'custom') {
        document.getElementById('customUrlInput').classList.add('visible');
        document.getElementById('customUrlInput').focus();
      } else {
        document.getElementById('customUrlInput').classList.remove('visible');
        saveAndApply();
      }
      updateSettingsUI();
    }

    function applyCustomBg() {
      const val = document.getElementById('customUrlInput').value.trim();
      if (!val) return alert('请输入图片地址');
      bgConfig.url = val;
      bgConfig.type = 'custom';
      saveAndApply();
    }

    // 实时更新模糊度
    function updateBlur(val) {
      bgConfig.blur = parseInt(val);
      document.getElementById('blurValue').textContent = val + 'px';
      document.documentElement.style.setProperty('--bg-blur', val + 'px');
      localStorage.setItem('nav_bg_config_v3', JSON.stringify(bgConfig));
    }

    // 实时更新暗度
    function updateOverlay(val) {
      bgConfig.overlay = parseFloat(val);
      document.getElementById('overlayValue').textContent = Math.round(val * 100) + '%';
      document.documentElement.style.setProperty('--overlay-opacity', val);
      localStorage.setItem('nav_bg_config_v3', JSON.stringify(bgConfig));
    }

    function disableBg() {
      bgConfig = { type: 'none', url: '', overlay: 0.6, blur: 8 };
      saveAndApply();
      closeSettings();
    }

    function saveAndApply() {
      localStorage.setItem('nav_bg_config_v3', JSON.stringify(bgConfig));
      applyBackgroundSettings();
    }

    function applyBackgroundSettings() {
      const bgLayer = document.getElementById('global-bg-layer');
      const overlay = document.getElementById('global-overlay');
      
      // 应用 CSS 变量
      document.documentElement.style.setProperty('--overlay-opacity', bgConfig.overlay);
      document.documentElement.style.setProperty('--bg-blur', bgConfig.blur + 'px');

      if (bgConfig.type === 'none') {
        bgLayer.style.backgroundImage = 'none';
        return;
      }

      let url = '';
      // 1080P 分辨率，保证加载速度
      if (bgConfig.type === 'bing') {
        url = 'https://api.dujin.org/bing/1920.php?t=' + Date.now();
      } else if (bgConfig.type === 'random') {
        url = 'https://picsum.photos/1920/1080?nature&random=' + Math.random();
      } else if (bgConfig.type === 'custom') {
        url = bgConfig.url;
      }

      bgLayer.style.backgroundImage = \`url('\${url}')\`;
    }

    // --- 时钟逻辑 ---
    function startClock() {
      if (clockInterval) clearInterval(clockInterval);
      updateClock();
      clockInterval = setInterval(updateClock, 1000);
    }
    function stopClock() { if (clockInterval) clearInterval(clockInterval); }
    function updateClock() {
      const now = new Date();
      document.getElementById('clockTime').textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      document.getElementById('clockDate').textContent = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    }

    // --- 原有书签逻辑 ---
    async function loadBookmarks() {
      const res = await fetch('/api/bookmarks');
      const json = await res.json();
      isLoggedIn = json.isLoggedIn;
      allBookmarks = json.data;
      allCategories = json.categories;
      renderCategories();
      renderBookmarks();
      updateAuthUI();
    }
    function renderCategories() {
      const container = document.getElementById('categoryContainer');
      const datalist = document.getElementById('catList');
      let html = \`<div class="cat-tag \${currentFilter === '全部' ? 'active' : ''}" onclick="filterCat('全部')">全部</div>\`;
      allCategories.forEach(cat => {
        html += \`<div class="cat-tag \${currentFilter === cat ? 'active' : ''}" onclick="filterCat('\${cat}')">\${cat}</div>\`;
      });
      container.innerHTML = html;
      datalist.innerHTML = allCategories.map(c => \`<option value="\${c}">\`).join('');
    }
    function filterCat(cat) { currentFilter = cat; renderCategories(); renderBookmarks(); }
    function renderBookmarks() {
      const grid = document.getElementById('bookmarkGrid');
      grid.innerHTML = '';
      const filtered = currentFilter === '全部' ? allBookmarks : allBookmarks.filter(b => b.category === currentFilter);
      if (filtered.length === 0) { grid.innerHTML = '<div class="empty-state">暂无此分类书签</div>'; return; }
      filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = \`
          <a href="\${item.url}" target="_blank" style="text-decoration:none; color:inherit; display:block; height:100%;">
            <h4 class="card-title">\${item.title} \${item.private ? '<span class="badge">私有</span>' : ''}</h4>
            <div class="card-meta"><span class="cat-label">\${item.category}</span><span style="font-size:0.7em">↗</span></div>
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
        panel.innerHTML = \`<span style="font-size:0.9rem">👋</span><button class="btn btn-outline" onclick="doLogout()" style="color:var(--text); border-color:var(--border); background:var(--card); padding: 4px 10px; font-size: 0.8rem;">退出</button>\`;
        addSection.classList.add('visible');
      } else {
        panel.innerHTML = \`
          <div class="login-form" id="loginForm">
            <input type="password" id="pwdInput" class="login-input" placeholder="密码" style="width: 80px;">
            <button class="btn btn-primary" onclick="doLogin()" style="padding: 4px 10px; font-size: 0.8rem;">登录</button>
            <button class="btn btn-outline" onclick="toggleLogin(false)" style="color:var(--text); border-color:var(--border); background:var(--card); padding: 4px 10px; font-size: 0.8rem;">×</button>
          </div>
          <button class="btn btn-primary" id="showLoginBtn" onclick="toggleLogin(true)" style="padding: 4px 10px; font-size: 0.8rem;">登录</button>
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
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) });
      const data = await res.json();
      if (data.success) window.location.reload(); else alert(data.message);
    }
    async function doLogout() { await fetch('/api/logout', { method: 'POST' }); window.location.reload(); }
    async function addBookmark() {
      const title = document.getElementById('newTitle').value;
      const url = document.getElementById('newUrl').value;
      const category = document.getElementById('newCategory').value || '未分类';
      const isPrivate = document.getElementById('newPrivate').checked;
      if (!title || !url) return alert('请填写标题和网址');
      const res = await fetch('/api/bookmarks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, url, category, isPrivate }) });
      if ((await res.json()).success) {
        document.getElementById('newTitle').value = ''; document.getElementById('newUrl').value = ''; document.getElementById('newCategory').value = ''; document.getElementById('newPrivate').checked = false;
        loadBookmarks();
      } else { alert('添加失败'); }
    }
    async function deleteBookmark(id) {
      if (!confirm('确定删除？')) return;
      const res = await fetch('/api/bookmarks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if ((await res.json()).success) loadBookmarks();
    }

    init();
  </script>
</body>
</html>
  `;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
