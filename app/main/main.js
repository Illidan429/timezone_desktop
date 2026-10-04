// 主进程入口：应用壳、协议、托盘、IPC
import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
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
const BASE_W = 480, BASE_H = 680;

function petScale() {
  const s = Number(loadSettings().prefs.petScale);
  return s >= 0.3 && s <= 3 ? s : 1;
}

function petWindowBounds() {
  const prefs = loadSettings().prefs;
  const s = petScale();
  const pos = prefs.petPos || (prefs.petBounds ? { x: prefs.petBounds.x, y: prefs.petBounds.y } : null);
  const w = Math.round(BASE_W * s), h = Math.round(BASE_H * s);
  // 位置在哪块屏上就按哪块屏校准（支持多显示器）；无位置记录（全新安装）时用主屏
  const display = screen.getDisplayNearestPoint(pos ? { x: pos.x, y: pos.y } : screen.getPrimaryDisplay().workArea).workArea;
  if (!pos) {
    return { x: display.x + display.width - w - 80, y: display.y + display.height - h - 80, width: w, height: h };
  }
  const x = Math.min(Math.max(pos.x, display.x), display.x + display.width - w);
  const y = Math.min(Math.max(pos.y, display.y), display.y + display.height - h);
  return { x, y, width: w, height: h };
}

// 应用缩放：以底边中点为锚缩放窗口，角色落点不跳。
// 拖动滑杆会高频触发，30ms 合并去抖，只应用最后一次，避免 setBounds 排队卡顿
let scaleApplyTimer = null;
function applyPetScale() {
  if (!petWin) return;
  clearTimeout(scaleApplyTimer);
  scaleApplyTimer = setTimeout(() => {
    if (!petWin || petWin.isDestroyed()) return;
    const b = petWin.getBounds();
    const s = petScale();
    const w = Math.round(BASE_W * s), h = Math.round(BASE_H * s);
    petWin.setBounds({
      x: Math.round(b.x + (b.width - w) / 2),
      y: Math.round(b.y + (b.height - h)),
      width: w, height: h
    });
    const nb = petWin.getBounds();
    updatePrefs({ petPos: { x: nb.x, y: nb.y } });
  }, 30);
}

function createPetWindow() {
  const b = petWindowBounds();
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
  log('宠物窗口已创建');
  petWin.webContents.on('did-fail-load', (_e, code, desc) => log('渲染页加载失败: ' + code + ' ' + desc));
  petWin.webContents.on('render-process-gone', (_e, details) => log('渲染进程崩溃: ' + JSON.stringify(details)));
  petWin.on('unresponsive', () => log('窗口失去响应'));
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
      const [x, y] = petWin.getPosition();
      updatePrefs({ petPos: { x, y } });
    }
  }, 400);
}

// ---------- 托盘 ----------
// 托盘/任务栏角标图标：优先用当前素材包的角色头像（换角色自动跟随）
function trayIcon() {
  const asset = path.join(ASSETS_ROOT, 'default', 'icon-head-32.png');
  if (fs.existsSync(asset)) {
    const img = nativeImage.createFromPath(asset);
    if (!img.isEmpty()) return img;
  }
  return nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
}

// Windows 11 按可执行文件路径记忆托盘图标是否显示；便携版每次解压路径不同，
// 导致每次启动图标都被归入隐藏溢出区。启动时主动把当前路径的图标设为"始终显示"。
function promoteTrayIcon() {
  // 后台执行，不阻塞启动；每步 reg 命令带 1.5 秒超时
  setImmediate(() => {
    try { promoteTrayIconSync(); } catch { /* 静默 */ }
  });
}

function promoteTrayIconSync() {
  try {
    // reg query 经 GBK 控制台输出，中文 exe 名会乱码；改用 ASCII 的父目录名匹配
    const exeDir = path.dirname(path.resolve(process.execPath)).toLowerCase();
    const base = ['HKCU', 'Control Panel', 'NotifyIconSettings'].join(String.fromCharCode(92));
    let out = '';
    try { out = execSync(`reg query "${base}"`, { encoding: 'utf8', timeout: 1500 }); } catch { return; }
    for (const raw of out.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      // reg query 输出全称 HKEY_CURRENT_USER，统一缩写为 HKCU 再比较
      if (!raw.startsWith('HKEY_CURRENT_USER') && !raw.startsWith('HKCU')) continue;
      const key = raw.startsWith('HKEY_CURRENT_USER') ? 'HKCU' + raw.slice('HKEY_CURRENT_USER'.length) : raw;
      if (!key.startsWith(base)) continue;
      try {
        const detail = execSync(`reg query "${key}" /v ExecutablePath`, { encoding: 'utf8', timeout: 1500 });
        if (detail.toLowerCase().includes(exeDir)) {
          execSync(`reg add "${key}" /v IsPromoted /t REG_DWORD /d 1 /f`, { timeout: 1500 });
          log('托盘图标已提升常显: ' + key);
          return;
        }
      } catch { /* 单键异常继续找下一个 */ }
    }
  } catch { /* 静默：非 Windows 11 或注册表不可用时跳过 */ }
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('桌宠伴侣');
  // 左键单击始终显示（避免找桌宠时误点托盘把角色藏起来的陷阱）；显式隐藏走菜单项
  tray.on('click', () => {
    if (petWin && !petWin.isDestroyed()) {
      petWin.show();
      petWin.focus();
    } else {
      petWin = null;
      createPetWindow();
    }
  });
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const prefs = loadSettings().prefs;
  const poses = readManifestPoses();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏角色', click: () => {
        if (petWin && !petWin.isDestroyed()) {
          petWin.isVisible() ? petWin.hide() : petWin.show();
        } else {
          petWin = null;
          createPetWindow();
        }
      } },
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

// ---------- 启动诊断日志（分发后排障用） ----------
const LOG_FILE = path.join(app.getPath('userData'), 'app-log.txt');

function log(msg) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, new Date().toISOString().replace('T', ' ').slice(0, 19) + ' ' + msg + String.fromCharCode(10));
  } catch { /* 日志失败不影响运行 */ }
}

// ---------- 对话历史持久化 ----------
const CHAT_HISTORY_FILE = path.join(app.getPath('userData'), 'chat-history.json');

function loadChatHistory() {
  try {
    const v = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
    if (Array.isArray(v)) return v.filter(x => x && typeof x.content === 'string');
  } catch { /* 首次无文件 */ }
  return [];
}

function saveChatHistory(history) {
  try {
    fs.mkdirSync(path.dirname(CHAT_HISTORY_FILE), { recursive: true });
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(history, null, 0), 'utf8');
  } catch (e) { console.warn('[chat] 历史保存失败：', e.message); }
}

function clearChatHistoryFile() {
  try { fs.rmSync(CHAT_HISTORY_FILE, { force: true }); } catch { /* 忽略 */ }
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('settings:get', () => sanitizedView());

  ipcMain.handle('settings:save', (_e, payload) => {
    saveSettings(payload);
    if (payload.prefs && 'petScale' in payload.prefs) applyPetScale();
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
    if ('petScale' in patch) applyPetScale();
    // 托盘菜单只含姿态/置顶/操作栏，拖动大小等高频操作不重建菜单
    if ('pose' in patch || 'topmost' in patch || 'controlsVisible' in patch) rebuildTrayMenu();
    petWin?.webContents.send('prefs-changed', sanitizedView().prefs);
    return loadSettings().prefs;
  });

  ipcMain.handle('api:test', (_e, type) => testApi(type));

  // 对话历史保存在主进程并持久化（重启不丢，参照参考项目的会话管理）
  const history = loadChatHistory();
  const saveHistory = () => saveChatHistory(history);
  ipcMain.handle('chat:llm', (_e, userText) => {
    history.push({ role: 'user', content: String(userText) });
    while (history.length > MAX_HISTORY_ROUNDS * 2) history.shift();
    return chatComplete(history).then(text => {
      history.push({ role: 'assistant', content: text });
      while (history.length > MAX_HISTORY_ROUNDS * 2) history.shift();
      saveHistory();
      return { text };
    });
  });
  ipcMain.handle('chat:asr', (_e, wav) => transcribe(Buffer.from(wav)));
  ipcMain.handle('chat:tts', (_e, text) => synthesize(String(text)));
  ipcMain.handle('chat:clear', () => {
    history.length = 0;
    clearChatHistoryFile();
    cancelAll();
    return { ok: true };
  });
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
      // 缩放：1.5 倍 → 窗口 720×1020，位置锚定底边
      await petWin.webContents.executeJavaScript(`window.petAPI.prefsSet({ petScale: 1.5 })`);
      await new Promise(r => setTimeout(r, 400));
      const sb = petWin.getBounds();
      result.checks.petScale = sb.width === 720 && sb.height === 1020;
      await petWin.webContents.executeJavaScript(`window.petAPI.prefsSet({ petScale: 1 })`);
      await new Promise(r => setTimeout(r, 300));
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
    log('检测到二次启动，唤起/重建窗口');
    // 再次启动保证有可见的桌宠：窗口还在就唤起，被销毁/丢失则重建
    if (petWin && !petWin.isDestroyed()) {
      petWin.show();
      petWin.focus();
    } else {
      petWin = null;
      createPetWindow();
    }
  });

  log('主进程启动, exe=' + process.execPath);

app.whenReady().then(() => {
    log('app ready');
    // 冒烟模式：预置一个特殊窗口位置，用于验证位置记忆恢复
    if (IS_SMOKE) updatePrefs({ petPos: { x: 111, y: 222 }, petScale: 1 });
    registerAppProtocol();
    registerIpc();
    try {
      createPetWindow();
      log('宠物窗口已创建');
    } catch (e) {
      log('窗口创建失败: ' + (e?.stack || e));
    }
    try {
      createTray();
      log('托盘已创建');
    } catch (e) {
      log('托盘创建失败: ' + (e?.stack || e));
    }
    promoteTrayIcon();
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
      const [x, y] = petWin.getPosition();
      updatePrefs({ petPos: { x, y } });
    }
  });
}
