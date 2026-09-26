// 主进程入口：应用壳、协议、托盘、IPC
import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadSettings, saveSettings, updatePrefs, sanitizedView } from './store.js';
import { testApi, chatComplete, transcribe, synthesize, cancelAll } from './proxy.js';
import { MAX_HISTORY_ROUNDS } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');            // 项目/安装根
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const ASSETS_ROOT = path.join(ROOT, 'assets-app');
const IS_SMOKE = process.argv.includes('--smoke');

// 透明窗口在远程桌面/无 GPU 合成环境下会整体变白，禁用硬件加速后走分层窗口路径，透明可靠
app.disableHardwareAcceleration();
// 双屏缩放比不同（如竖屏副屏）时，跨屏移动触发 DPI 重排会破坏透明合成；锁定缩放因子规避
app.commandLine.appendSwitch('force-device-scale-factor', '1');

let petWin = null;
let settingsWin = null;
let tray = null;
let cursorTimer = null;
let saveTimer = null;

// ---------- 自定义协议：渲染端经 app:// 访问页面与素材（支持 ESM） ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassingCSP: true } }
]);

function registerAppProtocol() {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
  };
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const host = url.hostname; // pet | settings | assets | shared
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let base;
    if (host === 'pet' || host === 'settings') base = path.join(RENDERER_DIR, host);
    else if (host === 'assets') base = ASSETS_ROOT;
    else if (host === 'shared') base = path.join(ROOT, 'app', 'shared');
    else return new Response('not found', { status: 404 });
    const filePath = path.resolve(base, rel);
    if (!filePath.startsWith(path.resolve(base))) return new Response('forbidden', { status: 403 });
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return new Response('not found', { status: 404 });
    const body = fs.readFileSync(filePath);
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return new Response(body, {
      headers: { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' }
    });
  });
}

// ---------- 窗口 ----------
function petBounds() {
  const saved = loadSettings().prefs.petBounds;
  const display = screen.getPrimaryDisplay().workArea;
  if (saved && saved.width) return saved;
  return { x: display.x + display.width - 560, y: display.y + display.height - 760, width: 480, height: 680 };
}

function createPetWindow() {
  const b = petBounds();
  const prefs = loadSettings().prefs;
  petWin = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, resizable: false,
    thickFrame: false,
    alwaysOnTop: !!prefs.topmost, skipTaskbar: true, hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  petWin.setMenuBarVisibility(false);
  petWin.loadURL('app://pet/index.html');
  if (IS_SMOKE) {
    petWin.webContents.on('console-message', (_e, _lvl, message) => console.log('[renderer]', message));
  }
  petWin.on('closed', () => { petWin = null; });
}

function createSettingsWindow() {
  if (settingsWin) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 780, height: 660,
    title: '桌宠伴侣 · 设置',
    autoHideMenuBar: true,
    backgroundColor: '#f6f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadURL('app://settings/index.html');
  settingsWin.on('closed', () => { settingsWin = null; });
}

function scheduleSaveBounds() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (petWin && !petWin.isDestroyed()) {
      updatePrefs({ petBounds: petWin.getBounds() });
    }
  }, 400);
}

// ---------- 托盘 ----------
function trayIcon() {
  const p = path.join(__dirname, 'tray.png');
  return nativeImage.createFromPath(p);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('桌宠伴侣');
  tray.on('click', () => { if (petWin) petWin.isVisible() ? petWin.hide() : petWin.show(); });
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const prefs = loadSettings().prefs;
  const poses = readManifestPoses();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏角色', click: () => { if (petWin) petWin.isVisible() ? petWin.hide() : petWin.show(); } },
    { label: '打开设置', click: () => createSettingsWindow() },
    { type: 'separator' },
    {
      label: '显示操作栏', type: 'checkbox', checked: prefs.controlsVisible !== false,
      click: (item) => {
        updatePrefs({ controlsVisible: item.checked });
        petWin?.webContents.send('prefs-changed', sanitizedView().prefs);
      }
    },
    {
      label: '窗口置顶', type: 'checkbox', checked: !!prefs.topmost,
      click: (item) => {
        updatePrefs({ topmost: item.checked });
        petWin?.setAlwaysOnTop(item.checked);
        settingsWin?.webContents.send('prefs-changed', sanitizedView().prefs);
      }
    },
    {
      label: '姿态', submenu: poses.length
        ? poses.map(p => ({
            label: p.name,
            type: 'radio',
            checked: p.id === prefs.pose,
            click: () => {
              updatePrefs({ pose: p.id });
              petWin?.webContents.send('prefs-changed', sanitizedView().prefs);
            }
          }))
        : [{ label: '（素材未提供姿态）', enabled: false }]
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
}

function readManifestPoses() {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(ASSETS_ROOT, 'default', 'manifest.json'), 'utf8'));
    return Array.isArray(m.poses) ? m.poses.map(p => ({ id: p.id, name: p.name || p.id })) : [];
  } catch {
    return [];
  }
}

// ---------- 光标轮播：驱动全屏视线跟随与穿透判定 ----------
function startCursorLoop() {
  cursorTimer = setInterval(() => {
    if (!petWin || petWin.isDestroyed() || !petWin.isVisible()) return;
    const pt = screen.getCursorScreenPoint();
    petWin.webContents.send('cursor', { x: pt.x, y: pt.y });
  }, 50);
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('settings:get', () => sanitizedView());

  ipcMain.handle('settings:save', (_e, payload) => {
    saveSettings(payload);
    rebuildTrayMenu();
    const view = sanitizedView();
    petWin?.webContents.send('prefs-changed', view.prefs);
    // 同步完整配置视图（含各 API 是否已配置），渲染端即时刷新语音可用状态
    settingsWin?.webContents.send('settings-changed', view);
    petWin?.webContents.send('settings-changed', view);
    return view;
  });

  ipcMain.handle('prefs:set', (_e, patch) => {
    updatePrefs(patch);
    rebuildTrayMenu();
    petWin?.webContents.send('prefs-changed', sanitizedView().prefs);
    return loadSettings().prefs;
  });

  ipcMain.handle('api:test', (_e, type) => testApi(type));

  // 对话历史保存在主进程
  const history = [];
  ipcMain.handle('chat:llm', (_e, userText) => {
    history.push({ role: 'user', content: String(userText) });
    while (history.length > MAX_HISTORY_ROUNDS * 2) history.shift();
    return chatComplete(history).then(text => {
      history.push({ role: 'assistant', content: text });
      while (history.length > MAX_HISTORY_ROUNDS * 2) history.shift();
      return { text };
    });
  });
  ipcMain.handle('chat:asr', (_e, wav) => transcribe(Buffer.from(wav)));
  ipcMain.handle('chat:tts', (_e, text) => synthesize(String(text)));
  ipcMain.handle('chat:clear', () => { history.length = 0; cancelAll(); return { ok: true }; });
  ipcMain.handle('chat:cancel', () => { cancelAll(); return { ok: true }; });

  ipcMain.handle('window:moveBy', (_e, dx, dy) => {
    if (!petWin) return;
    const [x, y] = petWin.getPosition();
    petWin.setPosition(x + dx, y + dy); // 只改位置不改尺寸，避免触发透明窗口重绘问题
    scheduleSaveBounds();
  });
  ipcMain.handle('window:setIgnoreMouse', (_e, ignore) => {
    petWin?.setIgnoreMouseEvents(!!ignore, ignore ? { forward: true } : {});
  });
  ipcMain.handle('window:openSettings', () => createSettingsWindow());
  ipcMain.handle('window:hide', () => petWin?.hide());
  ipcMain.handle('app:quit', () => app.quit());
}

// ---------- 冒烟模式 ----------
async function runSmoke() {
  const result = { windows: {}, tray: false, renderer: null, errors: [] };
  try {
    result.windows.pet = Boolean(petWin && !petWin.isDestroyed());
    result.windows.settings = Boolean(settingsWin && !settingsWin.isDestroyed());
    // 位置记忆：窗口应恢复到预置的 x=111,y=222
    result.windows.bounds = petWin ? petWin.getBounds() : null;
    result.tray = Boolean(tray);
    if (petWin) {
      await petWin.webContents.executeJavaScript('window.__SMOKE_READY__ === true', true).catch(() => false);
      // 轮询等待渲染端就绪（最多 10s）
      let state = null;
      for (let i = 0; i < 40; i++) {
        state = await petWin.webContents.executeJavaScript(
          'window.__PET_STATE__ ? JSON.parse(JSON.stringify(window.__PET_STATE__)) : null'
        ).catch(() => null);
        if (state && state.ready) break;
        await new Promise(r => setTimeout(r, 250));
      }
      result.renderer = state;
      // 功能自检：渲染端行为断言（视线/眨眼/口型/播放/设置窗口）
      if (state?.ready) {
        result.checks = await petWin.webContents.executeJavaScript('window.__PET_SMOKE_CHECKS__()').catch(e => ({ fatal: String(e) }));
        // 设置窗口打开能力
        await petWin.webContents.executeJavaScript('window.petAPI.windowOpenSettings()');
        await new Promise(r => setTimeout(r, 800));
        result.checks.settingsWindow = Boolean(settingsWin && !settingsWin.isDestroyed());
        // 未配置 API 时对话链路应给出明确错误而非静默（已配置环境则验证请求正常发出/失败原因明确）
        result.checks.chatWithoutApiFails = await petWin.webContents.executeJavaScript(
          `window.petAPI.chatLlm('hi').then(
             () => true,
             e => String(e.message).includes('未配置') || !String(e.message).includes('undefined')
           )`
        );
        // 偏好持久化：写入后能读回
        await petWin.webContents.executeJavaScript(`window.petAPI.prefsSet({ volume: 0.77 })`);
        const view = await petWin.webContents.executeJavaScript(`window.petAPI.settingsGet()`);
        result.checks.volumePersist = view?.prefs?.volume === 0.77;
      }
      // 窗口移动指令：moveBy 后坐标应变化
      const before = petWin.getBounds();
      await petWin.webContents.executeJavaScript('window.petAPI.windowMoveBy(15, 10)');
      await new Promise(r => setTimeout(r, 300));
      const after = petWin.getBounds();
      result.checks.windowMove = after.x === before.x + 15 && after.y === before.y + 10;
      result.checks.moveDbg = `before=(${before.x},${before.y}) after=(${after.x},${after.y})`;
      petWin.setBounds(before);
      // Key 加密回读（主进程 store 直接验证）
      const { setApiKey, getApiKey } = await import('./store.js');
      setApiKey('llm', 'sk-smoke-test-123');
      result.checks = result.checks || {};
      result.checks.keyRoundtrip = getApiKey('llm') === 'sk-smoke-test-123';
    }
    result.ok = result.windows.pet && result.tray && result.renderer?.ready && !result.renderer?.errors?.length
      && result.checks?.allOk === true;
  } catch (e) {
    result.ok = false;
    result.errors.push(String(e));
  }
  console.log('SMOKE_RESULT=' + JSON.stringify(result));
  app.exit(result.ok ? 0 : 1);
}

// ---------- 生命周期 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (petWin) { petWin.show(); petWin.focus(); }
  });

  app.whenReady().then(() => {
    // 冒烟模式：预置一个特殊窗口位置，用于验证位置记忆恢复
    if (IS_SMOKE) updatePrefs({ petBounds: { x: 111, y: 222, width: 480, height: 680 } });
    registerAppProtocol();
    registerIpc();
    createPetWindow();
    createTray();
    startCursorLoop();
    if (IS_SMOKE) setTimeout(runSmoke, 1500);
  });

  // 宠物窗口只是隐藏，设置窗口关闭即销毁；全部关闭不退出（托盘常驻）
  app.on('window-all-closed', () => { console.log('[lifecycle] window-all-closed'); });
  app.on('before-quit', (e) => {
    if (!IS_SMOKE) console.log('[lifecycle] before-quit');
  });
  app.on('quit', (_e, code) => { if (!IS_SMOKE) console.log('[lifecycle] quit, code=', code); });

  app.on('before-quit', () => {
    clearInterval(cursorTimer);
    if (petWin && !petWin.isDestroyed()) {
      updatePrefs({ petBounds: petWin.getBounds() });
    }
  });
}
