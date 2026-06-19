/**
 * Habit DB — 极速版
 * 优化：最小化代码、缓存数据、延迟加载
 */

const API = 'http://127.0.0.1:5001';
const state = { category: 'all', settingsOpen: false, dashboardOpen: false, data: { clipboard: [], files: [], snippets: [], projects: [], tools: [] } };

// 全局缓存
let cache = { data: null, time: 0 };

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    loadData();
});

function initEvents() {
    // 搜索
    let timer;
    document.getElementById('searchInput').addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => render(), 150);
    });

    // 导航
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.category = btn.dataset.category;
            render();
        });
    });

    // 键盘
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (state.dashboardOpen) toggleDashboard();
            else if (state.settingsOpen) toggleSettings();
            else close();
        }
    });
}

// ==================== 数据加载 ====================

async function loadData() {
    const now = Date.now();
    if (cache.data && (now - cache.time) < 5000) {
        processAndRender(cache.data);
        return;
    }

    try {
        const [clipboard, projects, apps] = await Promise.all([
            fetch('/api/clipboard').then(r => r.json()).catch(() => []),
            fetch('/api/projects').then(r => r.json()).catch(() => []),
            fetch('/api/apps').then(r => r.json()).catch(() => [])
        ]);

        cache = { data: { clipboard, projects, apps }, time: now };
        processAndRender(cache.data);
    } catch (e) {
        document.getElementById('contentSection').innerHTML = '<div class="error">加载失败</div>';
    }
}

function processAndRender({ clipboard, projects, apps }) {
    state.data.clipboard = [];
    state.data.files = [];
    state.data.snippets = [];

    (clipboard || []).forEach(item => {
        const c = item.content || '';
        const isCode = item.is_code || /\b(def|function|class|import|const)\b/.test(c);
        const isFile = /^[A-Z]:\\|^~?\//.test(c) && !c.startsWith('http');
        const isUrl = c.startsWith('http');

        if (isCode) state.data.snippets.push(item);
        else if (isFile) state.data.files.push(item);
        else state.data.clipboard.push(item);
    });

    state.data.projects = (projects || []).map(p => ({ ...p, progress: Math.min(100, Math.round((p.hours || 0) / 4 * 100)) }));
    state.data.tools = (apps || []).map(a => ({ ...a, name: (a.name || '').replace('.exe', '') }));

    updateCounts();
    render();
}

// ==================== 渲染 ====================

function render() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const content = document.getElementById('contentSection');

    let items = [];
    if (state.category === 'all') {
        items = [
            ...state.data.clipboard.slice(0, 5).map(i => ({ ...i, _type: 'clipboard' })),
            ...state.data.files.slice(0, 3).map(i => ({ ...i, _type: 'file' })),
            ...state.data.snippets.slice(0, 3).map(i => ({ ...i, _type: 'snippet' })),
            ...state.data.projects.slice(0, 3).map(i => ({ ...i, _type: 'project' })),
            ...state.data.tools.slice(0, 6).map(i => ({ ...i, _type: 'tool' }))
        ];
    } else if (state.category === 'clipboard') items = state.data.clipboard.map(i => ({ ...i, _type: 'clipboard' }));
    else if (state.category === 'files') items = state.data.files.map(i => ({ ...i, _type: 'file' }));
    else if (state.category === 'snippets') items = state.data.snippets.map(i => ({ ...i, _type: 'snippet' }));
    else if (state.category === 'projects') items = state.data.projects.map(i => ({ ...i, _type: 'project' }));
    else if (state.category === 'tools') items = state.data.tools.map(i => ({ ...i, _type: 'tool' }));

    if (q) items = items.filter(i => (i.content || i.name || i.title || '').toLowerCase().includes(q));

    if (items.length === 0) {
        content.innerHTML = '<div class="empty">暂无数据</div>';
        return;
    }

    content.innerHTML = items.map(item => {
        if (item._type === 'tool') return renderTool(item);
        return renderItem(item);
    }).join('');
}

function renderItem(item) {
    const type = item._type || 'clipboard';
    const icons = { clipboard: '📋', file: '📁', snippet: '💻', project: '📂', image: '🖼️', url: '🔗' };
    const icon = icons[type] || '📋';
    const title = (item.content || item.name || '').substring(0, 60);
    const sub = item.language || item.type || type;

    return `<div class="item" onclick="handleClick('${type}', '${escapeAttr(item.content || item.name || '')}')">
        <span class="item-icon">${icon}</span>
        <div class="item-body">
            <div class="item-title">${escapeHtml(title)}</div>
            <div class="item-sub">${sub}</div>
        </div>
        <div class="item-actions">
            <button class="action-btn" onclick="event.stopPropagation(); copyText('${escapeAttr(item.content || item.name || '')}')" title="复制">📋</button>
        </div>
    </div>`;
}

function renderTool(app) {
    return `<div class="tool-card" onclick="launchApp('${escapeAttr(app.name || '')}')">
        <div class="tool-icon">🖥️</div>
        <div class="tool-name">${escapeHtml(app.name || '')}</div>
        <div class="tool-hours">${(app.hours || 0).toFixed(1)}h</div>
    </div>`;
}

// ==================== 操作 ====================

async function handleClick(type, content) {
    if (type === 'file' || type === 'image') {
        await fetch('/api/action/open-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: content }) });
        close();
        return;
    }
    if (type === 'project') {
        await fetch('/api/action/open-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: content }) });
        close();
        return;
    }
    // 默认：复制并粘贴
    await copyAndPaste(content);
}

async function copyText(text) {
    if (window.habitDB?.copyAndClose) {
        await window.habitDB.copyAndClose(text);
        toast('已复制');
    }
}

async function copyAndPaste(text) {
    if (window.habitDB?.copyAndPaste) {
        await window.habitDB.copyAndPaste(text);
    } else {
        await copyText(text);
    }
}

async function launchApp(name) {
    await fetch('/api/action/launch-app', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: name }) });
    close();
}

function close() {
    if (window.habitDB) window.habitDB.closePopup();
}

// ==================== 面板 ====================

function toggleSettings() {
    state.settingsOpen = !state.settingsOpen;
    document.getElementById('settingsPanel').classList.toggle('open', state.settingsOpen);
    if (state.settingsOpen) loadSettings();
}

function toggleDashboard() {
    state.dashboardOpen = !state.dashboardOpen;
    document.getElementById('dashboardPanel').classList.toggle('open', state.dashboardOpen);
    if (state.dashboardOpen) loadDashboard();
}

async function loadSettings() {
    try {
        const s = await fetch('/api/settings').then(r => r.json());
        document.getElementById('mClipboard').checked = s.modules?.clipboard;
        document.getElementById('mAppUsage').checked = s.modules?.appUsage;
        document.getElementById('mWindow').checked = s.modules?.windowTracking;
    } catch (e) {}
}

async function toggleModule(name) {
    const el = document.getElementById('m' + name.charAt(0).toUpperCase() + name.slice(1));
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modules: { [name]: el.checked } }) });
    loadData();
}

async function toggleAutoStart() {
    if (window.habitDB?.setAutoStart) {
        const el = document.getElementById('autoStart');
        await window.habitDB.setAutoStart(el.checked);
    }
}

async function loadDashboard() {
    const [stats, apps] = await Promise.all([
        fetch('/api/stats').then(r => r.json()).catch(() => ({})),
        fetch('/api/apps').then(r => r.json()).catch(() => [])
    ]);
    document.getElementById('dClip').textContent = stats.total_clipboard || 0;
    document.getElementById('dWin').textContent = stats.total_windows || 0;
    document.getElementById('dApp').textContent = (apps || []).length;
}

function updateApiUrl() {
    const p = document.getElementById('aiProvider').value;
    document.getElementById('aiUrl').value = p === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1';
}

async function askAI() {
    const provider = document.getElementById('aiProvider').value;
    const url = document.getElementById('aiUrl').value;
    const key = document.getElementById('aiKey').value;
    const q = document.getElementById('aiQ').value;
    const output = document.getElementById('aiOutput');

    if (!key) { output.textContent = '请输入 API Key'; return; }
    output.textContent = '分析中...';

    const stats = await fetch('/api/stats').then(r => r.json()).catch(() => ({}));
    const ctx = `用户数据: 剪切板${stats.total_clipboard}条, 窗口${stats.total_windows}条. 问题: ${q}`;

    try {
        let resp;
        if (provider === 'anthropic') {
            resp = await fetch(`${url}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 500, messages: [{ role: 'user', content: ctx }] })
            });
            const d = await resp.json();
            output.textContent = d.content?.[0]?.text || JSON.stringify(d);
        } else {
            resp = await fetch(`${url}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: ctx }], max_tokens: 500 })
            });
            const d = await resp.json();
            output.textContent = d.choices?.[0]?.message?.content || JSON.stringify(d);
        }
    } catch (e) {
        output.textContent = '错误: ' + e.message;
    }
}

// ==================== 工具 ====================

function updateCounts() {
    document.getElementById('cCount').textContent = state.data.clipboard.length;
    document.getElementById('fCount').textContent = state.data.files.length;
    document.getElementById('sCount').textContent = state.data.snippets.length;
    document.getElementById('pCount').textContent = state.data.projects.length;
    document.getElementById('tCount').textContent = state.data.tools.length;
    const total = state.data.clipboard.length + state.data.files.length + state.data.snippets.length + state.data.projects.length + state.data.tools.length;
    document.getElementById('footerCount').textContent = total + ' 条';
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }
function escapeAttr(t) { return (t || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
}
