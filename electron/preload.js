const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('habitDB', {
  // 配置
  getConfig: () => ipcRenderer.invoke('get-config'),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),

  // 窗口控制
  closePopup: () => ipcRenderer.invoke('close-popup'),
  hidePopup: () => ipcRenderer.invoke('hide-popup'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // 剪切板操作
  copyAndClose: (content) => ipcRenderer.invoke('copy-and-close', content),
  copyAndPaste: (content) => ipcRenderer.invoke('copy-and-paste', content),

  // 开机自启
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),

  // 文件/URL 操作
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  openInBrowser: (url) => ipcRenderer.invoke('open-in-browser', url),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  openProject: (projectPath, appName) => ipcRenderer.invoke('open-project', { projectPath, appName }),
  launchApp: (appName) => ipcRenderer.invoke('launch-app', appName),

  // 事件监听
  onInitMode: (callback) => ipcRenderer.on('init-mode', (event, mode) => callback(mode)),
  onSwitchMode: (callback) => ipcRenderer.on('switch-mode', (event, mode) => callback(mode)),

  // 移除监听
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
