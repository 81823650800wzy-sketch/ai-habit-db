/**
 * Habit DB — 操作逻辑
 * 单击 = 主操作（自动执行）
 * 悬浮 = 显示备选按钮
 */

const CONFIG = {
    backendUrl: 'http://127.0.0.1:5001',
    apiToken: '',
    refreshInterval: 10000,
    searchDebounce: 80,
    toastDuration: 2000
};

const state = {
    category: 'all',
    selectedIndex: 0,
    searchQuery: '',
    settingsOpen: false,
    collectorSettings: null,
    permissions: {
        openFiles: true,
        openUrls: true,
        launchApps: true,
        openFolders: true,
        autoPaste: true
    },
    data: { clipboard: [], files: [], projects: [], tools: [], snippets: [] }
};

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
    await loadRuntimeConfig();
    initSearch();
    initNavigation();
    initKeyboard();
    loadSettings();
    await loadCollectorSettings();
    await loadAutoStart();
    await refreshData();
    render();
    setInterval(refreshData, CONFIG.refreshInterval);
});

async function loadRuntimeConfig() {
    if (!window.habitDB?.getConfig) return;
    try {
        const config = await window.habitDB.getConfig();
        CONFIG.backendUrl = `http://127.0.0.1:${config.backendPort || 5001}`;
        CONFIG.apiToken = config.apiToken || '';
    } catch (e) {}
}

// ==================== 设置 ====================

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('habitdb_settings') || '{}');
    const theme = settings.theme || 'system';
    document.getElementById('themeSelect').value = theme;
    applyTheme(theme);

    const opacity = settings.opacity || 85;
    document.getElementById('opacitySlider').value = opacity;
    document.getElementById('opacityValue').textContent = opacity + '%';
    document.documentElement.style.setProperty('--opacity', opacity / 100);

    const bgOpacity = settings.bgOpacity || 10;
    document.getElementById('bgOpacitySlider').value = bgOpacity;
    document.getElementById('bgOpacityValue').textContent = bgOpacity + '%';
    document.documentElement.style.setProperty('--bg-image-opacity', bgOpacity / 100);

    if (settings.bgImage) {
        document.documentElement.style.setProperty('--bg-image', `url(${settings.bgImage})`);
    }

    const perms = settings.permissions || {};
    state.permissions = { ...state.permissions, ...perms };
    renderPermissions();
}

function saveSettings() {
    const settings = JSON.parse(localStorage.getItem('habitdb_settings') || '{}');
    settings.theme = document.getElementById('themeSelect').value;
    settings.opacity = document.getElementById('opacitySlider').value;
    settings.bgOpacity = document.getElementById('bgOpacitySlider').value;
    settings.permissions = state.permissions;
    localStorage.setItem('habitdb_settings', JSON.stringify(settings));
}

function renderPermissions() {
    const p = state.permissions;
    setSwitchState('permOpenFiles', p.openFiles);
    setSwitchState('permOpenUrls', p.openUrls);
    setSwitchState('permLaunchApps', p.launchApps);
    setSwitchState('permOpenFolders', p.openFolders);
    setSwitchState('permAutoPaste', p.autoPaste);
}

function togglePermission(name) {
    state.permissions[name] = !state.permissions[name];
    renderPermissions();
    saveSettings();
}

function applyTheme(theme) {
    if (theme === 'system') {
        document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
        document.documentElement.dataset.theme = theme;
    }
}
function changeTheme(v) { applyTheme(v); saveSettings(); }
function changeOpacity(v) {
    document.getElementById('opacityValue').textContent = v + '%';
    document.documentElement.style.setProperty('--opacity', v / 100);
    saveSettings();
}
function changeBgOpacity(v) {
    document.getElementById('bgOpacityValue').textContent = v + '%';
    document.documentElement.style.setProperty('--bg-image-opacity', v / 100);
    saveSettings();
}
function changeBgImage(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.documentElement.style.setProperty('--bg-image', `url(${e.target.result})`);
            const s = JSON.parse(localStorage.getItem('habitdb_settings') || '{}');
            s.bgImage = e.target.result;
            localStorage.setItem('habitdb_settings', JSON.stringify(s));
        };
        reader.readAsDataURL(file);
    }
}
function toggleSettings() {
    state.settingsOpen = !state.settingsOpen;
    document.getElementById('settingsPanel').classList.toggle('open', state.settingsOpen);
}
function setSwitchState(id, active) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', active);
}

async function loadAutoStart() {
    if (window.habitDB?.getAutoStart) {
        const enabled = await window.habitDB.getAutoStart();
        setSwitchState('autoStart', enabled);
    }
}

async function toggleAutoStart() {
    if (window.habitDB?.setAutoStart) {
        const el = document.getElementById('autoStart');
        const current = el.classList.contains('active');
        const enabled = await window.habitDB.setAutoStart(!current);
        setSwitchState('autoStart', enabled);
        showToast(enabled ? '已开启开机自启' : '已关闭开机自启', 'success');
    }
}

async function loadCollectorSettings() {
    const settings = await fetchAPI('/api/settings');
    if (!settings) return;
    state.collectorSettings = settings;
    renderCollectorSettings();
}

function renderCollectorSettings() {
    const s = state.collectorSettings;
    if (!s) return;
    setSwitchState('moduleClipboard', !!s.modules?.clipboard);
    setSwitchState('moduleAppUsage', !!s.modules?.appUsage);
    setSwitchState('moduleWindowTracking', !!s.modules?.windowTracking);
    setSwitchState('privacySensitiveFilter', !!s.privacy?.filterSensitiveClipboard);
    const r = document.getElementById('retentionDaysInput');
    if (r) r.value = s.privacy?.retentionDays || 30;
}

async function updateCollectorSettings(patch) {
    const updated = await fetchAPI('/api/settings', { method: 'PUT', body: JSON.stringify(patch) });
    if (!updated) { showToast('设置失败', 'error'); return; }
    state.collectorSettings = updated;
    renderCollectorSettings();
    await refreshData();
    render();
}
async function toggleModule(name) {
    await updateCollectorSettings({ modules: { [name]: !state.collectorSettings?.modules?.[name] } });
}
async function togglePrivacy(name) {
    await updateCollectorSettings({ privacy: { [name]: !state.collectorSettings?.privacy?.[name] } });
}
async function changeRetentionDays(v) {
    await updateCollectorSettings({ privacy: { retentionDays: Math.max(1, Math.min(365, Number(v) || 30)) } });
}

// ==================== 数据加载 ====================

async function refreshData() {
    updateStatus('加载中...');
    try {
        const [clipboard, projects, apps] = await Promise.all([
            fetchAPI('/api/clipboard'),
            fetchAPI('/api/projects'),
            fetchAPI('/api/apps')
        ]);

        state.data.clipboard = [];
        state.data.snippets = [];
        state.data.files = [];
        state.data.images = [];

        (clipboard || []).forEach(item => {
            const c = classifyItem(item);
            if (c.category === 'snippet') state.data.snippets.push(c);
            else if (c.category === 'file') state.data.files.push(c);
            else if (c.category === 'image') state.data.images.push(c);
            else state.data.clipboard.push(c);
        });

        // 按使用次数排序
        const sortByCount = (a, b) => (b.copyCount || 0) - (a.copyCount || 0);
        state.data.clipboard.sort(sortByCount);
        state.data.snippets.sort(sortByCount);
        state.data.files.sort(sortByCount);
        state.data.images.sort(sortByCount);

        state.data.projects = (projects || []).map((item, i) => ({
            id: `project-${i}`, type: 'project', name: item.name,
            hours: item.hours, app: item.app || '', path: item.path || '',
            progress: Math.min(100, Math.round(item.hours / 4 * 100))
        }));

        state.data.tools = (apps || []).map((item, i) => ({
            id: `tool-${i}`, type: 'tool', name: cleanAppName(item.name),
            process: item.name, path: item.path || '', hours: item.hours,
            shortcut: i < 5 ? `⌘${i + 1}` : null
        }));

        updateCounts();
        const modules = state.collectorSettings?.modules || {};
        updateStatus(Object.values(modules).some(Boolean) ? '就绪' : '采集未开启');
    } catch (e) {
        updateStatus('加载失败');
    }
}

function classifyItem(item) {
    const content = item.content || '';
    const type = item.type || 'text';
    const language = item.language || detectLanguage(content);
    const isCode = item.is_code || language || looksLikeCode(content);

    let category = 'text';
    if (isCode) category = 'snippet';
    else if (type === 'url' || /^https?:\/\//.test(content)) category = 'url';
    else if (type === 'path' || /^[A-Z]:\\|^\//.test(content)) {
        // 判断是图片还是文件
        if (/\.(png|jpg|jpeg|gif|bmp|webp|svg|ico)$/i.test(content)) {
            category = 'image';
        } else {
            category = 'file';
        }
    }

    return {
        id: `clip-${item.id}`, type: 'clipboard', category, content,
        preview: item.title || content.substring(0, 100),
        language, time: item.time, sourceFile: item.source_file || null,
        copyCount: item.copy_count || 0
    };
}

function looksLikeCode(text) {
    if (!text) return false;
    return [/^(def|class|function|const|let|var|import|from)\s/m, /[{}\[\]();]/, /^\s*(\/\/|#)/m, /=>/, /\breturn\b/, /\bprint\s*\(/].some(r => r.test(text));
}
function detectLanguage(text) {
    if (!text) return null;
    for (const [r, l] of [[/\bdef\s+\w+/, 'Python'], [/\bimport\s+/, 'Python'], [/\bfunction\s+/, 'JavaScript'], [/\bconst\s+/, 'JavaScript'], [/#include\s*</, 'C++']]) {
        if (r.test(text)) return l;
    }
    return null;
}
function cleanAppName(name) {
    if (!name) return '未知';
    // 移除扩展名
    let clean = name.replace(/\.(exe|app|cmd|bat|ps1|sh|msi)$/i, '');
    // 处理路径形式
    if (clean.includes('\\') || clean.includes('/')) {
        clean = clean.split(/[\\/]/).pop();
    }
    // 驼峰转空格
    clean = clean.replace(/([A-Z])/g, ' $1').trim();
    // 特殊名称映射
    const nameMap = {
        'Code': 'VS Code',
        'Cursor': 'Cursor',
        'Chrome': 'Chrome',
        'Ms Edge': 'Edge',
        'Firefox': 'Firefox',
        'Windows Terminal': '终端',
        'Cmd': '命令提示符',
        'Power Shell': 'PowerShell',
        'We Chat': '微信',
        'PyCharm': 'PyCharm',
    };
    return nameMap[clean] || clean;
}

// ==================== API ====================

async function fetchAPI(endpoint, options = {}) {
    try {
        const headers = { ...apiHeaders(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
        const resp = await fetch(`${CONFIG.backendUrl}${endpoint}`, { ...options, headers });
        return resp.ok ? await resp.json() : null;
    } catch (e) { return null; }
}
function apiHeaders(extra = {}) {
    const h = { ...extra };
    if (CONFIG.apiToken) h['X-AI-Habit-Token'] = CONFIG.apiToken;
    return h;
}
async function callAction(action, data) {
    try {
        const resp = await fetch(`${CONFIG.backendUrl}/api/action/${action}`, {
            method: 'POST', headers: apiHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data)
        });
        return await resp.json();
    } catch (e) { return { success: false, error: e.message }; }
}

// ==================== 渲染 ====================

function render() {
    const content = document.getElementById('contentSection');
    if (state.category === 'all') {
        let html = '';
        if (state.data.clipboard.length) html += renderGroup('剪切板', 'clipboard', state.data.clipboard.slice(0, 5));
        if (state.data.images.length) html += renderGroup('图片', 'images', state.data.images.slice(0, 3));
        if (state.data.files.length) html += renderGroup('文件', 'files', state.data.files.slice(0, 3));
        if (state.data.snippets.length) html += renderGroup('代码片段', 'snippets', state.data.snippets.slice(0, 3));
        if (state.data.projects.length) html += renderGroup('项目', 'projects', state.data.projects.slice(0, 3));
        if (state.data.tools.length) html += renderToolsGroup('应用', state.data.tools.slice(0, 6));
        content.innerHTML = html || renderEmptyState();
    } else if (state.category === 'tools') {
        content.innerHTML = renderToolsGroup('应用', getFilteredItems());
    } else {
        const items = getFilteredItems();
        const titles = { clipboard: '剪切板', images: '图片', files: '文件', projects: '项目', snippets: '代码片段' };
        content.innerHTML = items.length ? renderGroup(titles[state.category] || '结果', state.category, items) : renderEmptyState();
    }
    updateSelection();
}

function renderGroup(title, category, items) {
    return `<div class="group"><div class="group-header"><span class="group-title">${title}</span><span class="group-action" onclick="showAll('${category}')">全部 →</span></div>${items.map(renderListItem).join('')}</div>`;
}

function renderToolsGroup(title, tools) {
    return `<div class="group"><div class="group-header"><span class="group-title">${title}</span></div><div class="tools-grid">${tools.map(renderToolCard).join('')}</div></div>`;
}

function renderListItem(item) {
    const iconClass = item.category === 'snippet' ? 'code' :
                     item.category === 'url' ? 'url' :
                     item.category === 'image' ? 'image' :
                     item.category === 'file' ? 'file' :
                     item.type === 'project' ? 'project' : 'clipboard';

    const badgeText = item.language ||
                     (item.category === 'image' ? '图片' :
                      item.category === 'file' ? '文件' :
                      item.category === 'url' ? '链接' : '');

    const subtitle = item.type === 'project' ?
        `${item.app ? cleanAppName(item.app) + ' · ' : ''}今日 ${item.hours}h` :
        `${badgeText}${item.time ? ' · ' + item.time : ''}${item.copyCount > 0 ? ' · 使用' + item.copyCount + '次' : ''}`;

    const actions = getActions(item);

    return `
        <div class="list-item" data-id="${item.id}" onclick="handlePrimaryAction('${item.id}', '${item.type}', '${item.category}')">
            <div class="item-icon ${iconClass}">${getIconSVG(item.category)}</div>
            <div class="item-content">
                <div class="item-title">${escapeHtml(item.preview || item.name || '')}</div>
                <div class="item-subtitle">${escapeHtml(subtitle)}</div>
                ${item.type === 'project' ? `<div class="progress-bar"><div class="progress-fill" style="width:${item.progress}%"></div></div>` : ''}
            </div>
            <div class="item-meta">
                ${badgeText ? `<span class="item-badge ${item.language?.toLowerCase() || 'default'}">${badgeText}</span>` : ''}
                <span class="item-time">${item.time || ''}</span>
            </div>
            <div class="item-actions">
                ${actions.map(a => `<button class="action-btn" onclick="event.stopPropagation(); ${a.handler}" title="${a.title}">${a.icon}</button>`).join('')}
            </div>
        </div>
    `;
}

function getActions(item) {
    const actions = [];

    if (item.category === 'snippet') {
        // 代码：主操作=粘贴，备选=打开源文件、仅复制
        if (item.sourceFile) actions.push({ icon: '📂', title: '打开源文件', handler: `openSourceFile('${escapeAttr(item.sourceFile)}')` });
        actions.push({ icon: '📋', title: '仅复制', handler: `copyOnly('${escapeAttr(item.content)}')` });
    }
    else if (item.category === 'url') {
        // URL：主操作=粘贴，备选=打开浏览器
        actions.push({ icon: '🔗', title: '打开链接', handler: `openUrl('${escapeAttr(item.content)}')` });
        actions.push({ icon: '📋', title: '仅复制', handler: `copyOnly('${escapeAttr(item.content)}')` });
    }
    else if (item.category === 'image') {
        // 图片：主操作=粘贴路径，备选=打开图片、打开文件夹
        actions.push({ icon: '🖼️', title: '打开图片', handler: `openFile('${escapeAttr(item.content)}')` });
        actions.push({ icon: '📂', title: '打开文件夹', handler: `showInFolder('${escapeAttr(item.content)}')` });
    }
    else if (item.category === 'file') {
        // 文件：主操作=打开文件，备选=打开文件夹、复制路径
        actions.push({ icon: '📂', title: '打开文件夹', handler: `showInFolder('${escapeAttr(item.content)}')` });
        actions.push({ icon: '📋', title: '复制路径', handler: `copyOnly('${escapeAttr(item.content)}')` });
    }
    else if (item.type === 'project') {
        // 项目：主操作=用IDE打开，备选=打开文件夹
        actions.push({ icon: '📂', title: '打开文件夹', handler: `openFolder('${escapeAttr(item.path || item.name)}')` });
        actions.push({ icon: '📋', title: '复制名称', handler: `copyOnly('${escapeAttr(item.name)}')` });
    }
    else if (item.type === 'tool') {
        // 应用：主操作=启动，备选=复制路径
        actions.push({ icon: '📋', title: '复制路径', handler: `copyOnly('${escapeAttr(item.path || item.process)}')` });
    }
    else {
        // 文本：主操作=粘贴，备选=仅复制
        actions.push({ icon: '📋', title: '仅复制', handler: `copyOnly('${escapeAttr(item.content)}')` });
    }

    return actions;
}

function renderToolCard(tool) {
    return `
        <div class="tool-card" onclick="launchApp('${escapeAttr(tool.process)}')">
            <div class="tool-icon-wrapper">${getToolIcon(tool.name)}</div>
            <div class="tool-name">${escapeHtml(tool.name)}</div>
            ${tool.shortcut ? `<div class="tool-shortcut">${tool.shortcut}</div>` : ''}
        </div>
    `;
}

function renderEmptyState() {
    const msgs = {
        all: { text: '暂无数据', hint: '复制内容或打开文件后会自动记录' },
        clipboard: { text: '暂无剪切板记录', hint: '按 Ctrl+C 复制内容后会自动捕获' },
        files: { text: '暂无文件记录', hint: '打开文件后会自动记录路径' },
        projects: { text: '暂无项目记录', hint: '在 IDE 中打开项目后会自动识别' },
        tools: { text: '暂无应用记录', hint: '使用应用后会自动统计' },
        snippets: { text: '暂无代码片段', hint: '复制代码后会自动分类' }
    };
    const m = msgs[state.category] || msgs.all;
    return `<div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div><div class="empty-text">${m.text}</div><div class="empty-hint">${m.hint}</div></div>`;
}

// ==================== 图标 ====================

function getIconSVG(category) {
    const icons = {
        clipboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`,
        code: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
        url: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
        image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
        file: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
        project: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
    };
    return icons[category] || icons.clipboard;
}

function getToolIcon(name) {
    if (!name) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;

    const n = name.toLowerCase();

    // IDE / 代码编辑器
    if (n.includes('code') || n.includes('cursor') || n.includes('pycharm') || n.includes('idea') || n.includes('sublime') || n.includes('vim'))
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

    // 浏览器
    if (n.includes('chrome') || n.includes('edge') || n.includes('firefox') || n.includes('brave') || n.includes('opera'))
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`;

    // 终端 / 命令行
    if (n.includes('terminal') || n.includes('cmd') || n.includes('powershell') || n.includes('bash') || n.includes('wt'))
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`;

    // 通讯
    if (n.includes('wechat') || n.includes('qq') || n.includes('slack') || n.includes('discord') || n.includes('telegram') || n.includes('teams'))
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

    // 音乐 / 媒体
    if (n.includes('music') || n.includes('spotify') || n.includes('kugou') || n.includes('vlc') || n.includes('bilibili'))
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

    // 办公
    if (n.includes('word') || n.includes('excel') || n.includes('powerpoint') || n.includes('notion') || n.includes('obsidian'))
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

    // 设计
    if (n.includes('figma') || n.includes('photoshop') || n.includes('illustrator') || n.includes('sketch'))
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4"/></svg>`;

    // 开发工具
    if (n.includes('git') || n.includes('docker') || n.includes('postman') || n.includes('navicat'))
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>`;

    // 默认
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
}

// ==================== 过滤 ====================

function getFilteredItems() {
    let items = [];
    switch (state.category) {
        case 'clipboard': items = state.data.clipboard; break;
        case 'images': items = state.data.images; break;
        case 'files': items = state.data.files; break;
        case 'snippets': items = state.data.snippets; break;
        case 'projects': items = state.data.projects; break;
        case 'tools': items = state.data.tools; break;
        default: items = [...state.data.clipboard, ...state.data.images, ...state.data.files, ...state.data.snippets, ...state.data.projects];
    }
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        items = items.filter(i => (i.preview || i.name || i.content || '').toLowerCase().includes(q));
    }
    return items;
}

// ==================== 事件 ====================

function initSearch() {
    const input = document.getElementById('searchInput');
    let timer;
    input.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.searchQuery = e.target.value.trim(); state.selectedIndex = 0; render(); }, CONFIG.searchDebounce);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (state.searchQuery) { input.value = ''; state.searchQuery = ''; render(); }
            else if (state.settingsOpen) toggleSettings();
            else closePopup();
        }
    });
}

function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => setCategory(item.dataset.category));
    });
}

function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (state.settingsOpen) return;
        const items = document.querySelectorAll('.list-item, .tool-card');
        const max = items.length - 1;
        switch (e.key) {
            case 'ArrowUp': e.preventDefault(); state.selectedIndex = Math.max(0, state.selectedIndex - 1); updateSelection(); break;
            case 'ArrowDown': e.preventDefault(); state.selectedIndex = Math.min(max, state.selectedIndex + 1); updateSelection(); break;
            case 'Enter': e.preventDefault(); if (items[state.selectedIndex]) items[state.selectedIndex].click(); break;
            case 'Tab':
                e.preventDefault();
                const cats = ['all', 'clipboard', 'files', 'snippets', 'projects', 'tools'];
                const idx = cats.indexOf(state.category);
                setCategory(cats[e.shiftKey ? (idx - 1 + cats.length) % cats.length : (idx + 1) % cats.length]);
                break;
            case 'Escape': closePopup(); break;
        }
    });
}

function setCategory(cat) {
    state.category = cat;
    state.selectedIndex = 0;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.category === cat));
    render();
}

function updateSelection() {
    const items = document.querySelectorAll('.list-item, .tool-card');
    items.forEach((item, i) => item.classList.toggle('selected', i === state.selectedIndex));
    if (items[state.selectedIndex]) items[state.selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updateCounts() {
    document.getElementById('clipboardCount').textContent = state.data.clipboard.length;
    document.getElementById('filesCount').textContent = state.data.files.length + state.data.images.length;
    document.getElementById('projectsCount').textContent = state.data.projects.length;
    document.getElementById('toolsCount').textContent = state.data.tools.length;
    document.getElementById('snippetsCount').textContent = state.data.snippets.length;
    const total = state.data.clipboard.length + state.data.images.length + state.data.files.length + state.data.snippets.length + state.data.projects.length + state.data.tools.length;
    document.getElementById('footerCount').textContent = `${total} 条`;
}

function updateStatus(text) {
    document.getElementById('footerStatus').textContent = text;
}

// ==================== 主操作（单击） ====================

async function handlePrimaryAction(id, type, category) {
    const item = findItem(id, type);
    if (!item) return;

    // 文件/图片 → 直接打开
    if (category === 'file' || category === 'image') {
        if (state.permissions.openFiles) {
            await window.habitDB?.openFile(item.content);
            closePopup();
        } else {
            showToast('请在设置中开启"打开文件"权限', 'error');
        }
        return;
    }

    // 项目 → 用 IDE 打开
    if (type === 'project') {
        if (state.permissions.openFiles) {
            const result = await callAction('open-project', { project: item.name, path: item.path });
            if (result.success) closePopup();
            else showToast('打开失败', 'error');
        } else {
            showToast('请在设置中开启"打开文件"权限', 'error');
        }
        return;
    }

    // 应用 → 复制路径（而不是启动）
    if (type === 'tool') {
        const path = item.path || item.process || '';
        if (window.habitDB?.copyAndClose) {
            await window.habitDB.copyAndClose(path);
            showToast('已复制应用路径', 'success');
        } else {
            await callAction('copy', { content: path });
            closePopup();
        }
        return;
    }

    // 文本/代码/URL → 粘贴到输入框
    const content = item.content || item.preview || '';
    if (content) {
        if (state.permissions.autoPaste && window.habitDB?.copyAndPaste) {
            await window.habitDB.copyAndPaste(content);
        } else if (window.habitDB?.copyAndClose) {
            await window.habitDB.copyAndClose(content);
            showToast('已复制，Ctrl+V 粘贴', 'success');
        } else {
            await callAction('copy', { content });
            closePopup();
        }
    }
}

// ==================== 备选操作（按钮） ====================

async function copyOnly(content) {
    if (window.habitDB?.copyAndClose) {
        await window.habitDB.copyAndClose(content);
        showToast('已复制', 'success');
    } else {
        await callAction('copy', { content });
        closePopup();
    }
}

async function openUrl(url) {
    if (state.permissions.openUrls) {
        await window.habitDB?.openUrl(url);
        closePopup();
    } else {
        showToast('请在设置中开启"打开链接"权限', 'error');
    }
}

async function openSourceFile(filePath) {
    if (state.permissions.openFiles) {
        await window.habitDB?.openFile(filePath);
        closePopup();
    } else {
        showToast('请在设置中开启"打开文件"权限', 'error');
    }
}

async function showInFolder(filePath) {
    if (state.permissions.openFolders) {
        await window.habitDB?.showInFolder(filePath);
        closePopup();
    } else {
        showToast('请在设置中开启"打开文件夹"权限', 'error');
    }
}

async function openFolder(path) {
    if (state.permissions.openFolders) {
        await window.habitDB?.openFile(path);
        closePopup();
    } else {
        showToast('请在设置中开启"打开文件夹"权限', 'error');
    }
}

async function launchApp(processName) {
    if (state.permissions.launchApps) {
        await window.habitDB?.launchApp(processName);
        closePopup();
    } else {
        showToast('请在设置中开启"启动应用"权限', 'error');
    }
}

function showAll(category) { setCategory(category); }

async function clearClipboard() {
    await fetch(`${CONFIG.backendUrl}/api/clipboard/clear`, { method: 'POST', headers: apiHeaders() });
    showToast('已清空', 'success');
    await refreshData(); render();
}

async function exportData() {
    const r = await fetchAPI('/api/export/all');
    showToast(r?.success ? '已导出' : '导出失败', r?.success ? 'success' : 'error');
}

// ==================== 工具 ====================

function findItem(id, type) {
    return [...state.data.clipboard, ...state.data.files, ...state.data.snippets, ...state.data.projects, ...state.data.tools].find(i => i.id === id);
}

function closePopup() { if (window.habitDB) window.habitDB.closePopup(); }

function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text || ''; return d.innerHTML; }
function escapeAttr(text) { return (text || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function showToast(message, type = 'info') {
    const wrapper = document.getElementById('toastWrapper');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
        success: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        error: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    };
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    wrapper.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'toastOut 0.2s ease-in forwards'; setTimeout(() => toast.remove(), 200); }, CONFIG.toastDuration);
}
