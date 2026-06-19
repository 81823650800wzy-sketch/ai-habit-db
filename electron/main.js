const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, screen, clipboard, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

let mainWindow = null;
let popupWindow = null;
let tray = null;
let pythonProcess = null;

const CONFIG = {
  popupWidth: 680,
  popupHeight: 520,
  shortcutToggle: 'CommandOrControl+Shift+Space',
  shortcutClipboard: 'CommandOrControl+Shift+C',
  shortcutProjects: 'CommandOrControl+Shift+P',
  shortcutTools: 'CommandOrControl+Shift+T',
  backendPort: 5001,
  apiToken: crypto.randomBytes(32).toString('hex'),
  devMode: process.argv.includes('--dev')
};

// ==================== 生命周期 ====================

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    createPopupWindow('default');
  });

  app.whenReady().then(() => {
    createTray();
    registerShortcuts();
    startPythonBackend();
    console.log('[HabitDB] 已启动，快捷键:', CONFIG.shortcutToggle);
  });
}

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  if (pythonProcess) pythonProcess.kill();
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ==================== 开机自启动 ====================

function getAutoStartEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}

function setAutoStartEnabled(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe'),
    args: ['--hidden']
  });
  console.log(`[HabitDB] 开机自启: ${enabled ? '开启' : '关闭'}`);
}

// ==================== 弹窗（不抢焦点） ====================

function createPopupWindow(mode = 'default') {
  if (popupWindow && !popupWindow.isDestroyed()) {
    if (popupWindow.isVisible()) {
      popupWindow.hide();
      return;
    }
    // 显示并确保在最上层
    popupWindow.showInactive();
    popupWindow.setAlwaysOnTop(true, 'screen-saver');
    popupWindow.webContents.send('switch-mode', mode);
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const x = Math.round((width - CONFIG.popupWidth) / 2);
  const y = Math.round((height - CONFIG.popupHeight) / 3);

  popupWindow = new BrowserWindow({
    width: CONFIG.popupWidth,
    height: CONFIG.popupHeight,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: CONFIG.devMode
    }
  });

  // 确保窗口始终在最上层
  popupWindow.setAlwaysOnTop(true, 'screen-saver');

  popupWindow.loadFile(path.join(__dirname, '..', 'src', 'popup.html'));

  popupWindow.once('ready-to-show', () => {
    // 显示窗口并确保在最上层
    popupWindow.showInactive();
    popupWindow.setAlwaysOnTop(true, 'screen-saver');
    popupWindow.webContents.send('init-mode', mode);
  });

  // 失去焦点时关闭（但不是立即，给点击面板留时间）
  let blurTimeout = null;
  popupWindow.on('blur', () => {
    blurTimeout = setTimeout(() => {
      if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.hide();
      }
    }, 300);
  });

  // 获得焦点时取消关闭
  popupWindow.on('focus', () => {
    if (blurTimeout) {
      clearTimeout(blurTimeout);
      blurTimeout = null;
    }
  });

  popupWindow.on('closed', () => {
    popupWindow = null;
  });
}

// ==================== 托盘 ====================

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('AI Habit DB');

  const menu = Menu.buildFromTemplate([
    { label: '打开面板', click: () => createPopupWindow('default') },
    { label: '剪切板', click: () => createPopupWindow('clipboard') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => createPopupWindow('default'));
}

// ==================== 快捷键 ====================

function registerShortcuts() {
  globalShortcut.register(CONFIG.shortcutToggle, () => createPopupWindow('default'));
  globalShortcut.register(CONFIG.shortcutClipboard, () => createPopupWindow('clipboard'));
  globalShortcut.register(CONFIG.shortcutProjects, () => createPopupWindow('projects'));
  globalShortcut.register(CONFIG.shortcutTools, () => createPopupWindow('tools'));
}

// ==================== Python 后端 ====================

function startPythonBackend() {
  const backendPath = path.join(__dirname, '..', 'backend', 'server.py');
  try {
    pythonProcess = spawn('python', [backendPath, '--port', CONFIG.backendPort], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        AI_HABIT_API_TOKEN: CONFIG.apiToken
      }
    });
    pythonProcess.stdout.on('data', (d) => console.log(`[Python] ${d.toString().trim()}`));
    pythonProcess.stderr.on('data', (d) => console.log(`[Python] ${d.toString().trim()}`));
    pythonProcess.on('close', (code) => {
      console.log(`[Python] 退出: ${code}`);
      pythonProcess = null;
    });
  } catch (e) {
    console.error('[HabitDB] Python 启动失败:', e.message);
  }
}

// ==================== IPC ====================

ipcMain.handle('get-config', () => CONFIG);
ipcMain.handle('get-backend-url', () => `http://127.0.0.1:${CONFIG.backendPort}`);

// 开机自启
ipcMain.handle('get-auto-start', () => getAutoStartEnabled());
ipcMain.handle('set-auto-start', (event, enabled) => {
  setAutoStartEnabled(enabled);
  return getAutoStartEnabled();
});

// 复制到剪切板并关闭（PowerToys 方案）
ipcMain.handle('copy-and-close', async (event, content) => {
  clipboard.writeText(String(content || ''));
  console.log('[HabitDB] 已复制到剪切板');

  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.hide();
  }

  return { success: true };
});

// 复制并自动粘贴（保持焦点方案）
ipcMain.handle('copy-and-paste', async (event, content) => {
  // 1. 写入剪切板
  clipboard.writeText(String(content || ''));

  // 2. 隐藏弹窗
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.hide();
  }

  // 3. 短暂等待后发送 Ctrl+V
  await new Promise(r => setTimeout(r, 100));

  return new Promise((resolve) => {
    const ps = `
      Add-Type -AssemblyName System.Windows.Forms
      Start-Sleep -Milliseconds 50
      [System.Windows.Forms.SendKeys]::SendWait('^v')
    `;
    exec(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true }, (error) => {
      resolve({ success: !error, error: error?.message });
    });
  });
});

// 打开 URL
ipcMain.handle('open-url', async (event, url) => {
  try {
    if (!url.startsWith('http')) url = 'https://' + url;
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 打开文件
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 在默认浏览器中打开
ipcMain.handle('open-in-browser', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 打开文件夹并选中文件
ipcMain.handle('show-in-folder', async (event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 打开项目（用对应 IDE）
ipcMain.handle('open-project', async (event, { projectPath, appName }) => {
  try {
    if (appName && projectPath) {
      // 尝试用 shell.openPath 打开
      const result = await shell.openPath(`${appName} "${projectPath}"`);
      if (result) {
        // 如果失败，尝试直接 spawn
        const child = spawn(appName, [projectPath], { detached: true, stdio: 'ignore', shell: true });
        child.on('error', () => {});
      }
    } else if (projectPath) {
      await shell.openPath(projectPath);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 启动应用 - 通过真实路径启动
ipcMain.handle('launch-app', async (event, appName, appPath) => {
  if (!appName) return { success: false, error: '无应用名' };

  try {
    // 1. 如果有完整路径，直接启动
    if (appPath && require('fs').existsSync(appPath)) {
      await shell.openPath(appPath);
      return { success: true, method: 'path' };
    }

    // 2. 从正在运行的进程中查找路径
    const { execSync } = require('child_process');
    try {
      const result = execSync(
        `powershell -Command "Get-Process -Name '${appName.replace('.exe', '')}' | Select-Object -First 1 -ExpandProperty Path"`,
        { encoding: 'utf8', timeout: 3000, windowsHide: true }
      ).trim();
      if (result && require('fs').existsSync(result)) {
        await shell.openPath(result);
        return { success: true, method: 'process' };
      }
    } catch (e) {}

    // 3. 用 PowerShell 查找 UWP 应用
    try {
      const appId = execSync(
        `powershell -Command "Get-StartApps | Where-Object {$_.Name -like '*${appName.replace('.exe', '')}*'} | Select-Object -First 1 -ExpandProperty AppID"`,
        { encoding: 'utf8', timeout: 3000, windowsHide: true }
      ).trim();
      if (appId) {
        exec(`explorer.exe shell:AppsFolder\\${appId}`, { windowsHide: true });
        return { success: true, method: 'uwp' };
      }
    } catch (e) {}

    // 4. start 命令
    exec(`start "" "${appName}"`, { windowsHide: true });
    return { success: true, method: 'start' };

  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 仅关闭弹窗
ipcMain.handle('close-popup', () => {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.hide();
  }
});

ipcMain.handle('hide-popup', () => {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.hide();
  }
});

ipcMain.handle('minimize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.handle('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

module.exports = { createPopupWindow };
