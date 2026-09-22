// 预加载脚本：以受控 API 暴露主进程能力，渲染端不接触 Node
// 注意：Electron 的 preload 固定以 CommonJS 加载，此处必须用 require
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSave: (payload) => ipcRenderer.invoke('settings:save', payload),
  prefsSet: (patch) => ipcRenderer.invoke('prefs:set', patch),
  apiTest: (type) => ipcRenderer.invoke('api:test', type),

  chatLlm: (text) => ipcRenderer.invoke('chat:llm', text),
  chatAsr: (wavArrayBuffer) => ipcRenderer.invoke('chat:asr', wavArrayBuffer),
  chatTts: (text) => ipcRenderer.invoke('chat:tts', text),
  chatClear: () => ipcRenderer.invoke('chat:clear'),
  chatCancel: () => ipcRenderer.invoke('chat:cancel'),

  windowMoveBy: (dx, dy) => ipcRenderer.invoke('window:moveBy', dx, dy),
  windowSetIgnoreMouse: (ignore) => ipcRenderer.invoke('window:setIgnoreMouse', ignore),
  windowOpenSettings: () => ipcRenderer.invoke('window:openSettings'),
  windowHide: () => ipcRenderer.invoke('window:hide'),
  appQuit: () => ipcRenderer.invoke('app:quit'),

  onCursor: (cb) => { ipcRenderer.on('cursor', (_e, pt) => cb(pt)); },
  onPrefsChanged: (cb) => { ipcRenderer.on('prefs-changed', (_e, prefs) => cb(prefs)); }
});
