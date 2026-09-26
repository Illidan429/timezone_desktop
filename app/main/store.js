// 设置持久化：API 配置（Key 加密）与应用偏好
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  apis: {
    asr: { baseUrl: '', model: '' },
    llm: { baseUrl: '', model: '' },
    tts: { baseUrl: '', model: '', voice: 'alloy' }
  },
  prefs: {
    theme: 'day',
    topmost: true,
    pose: 'idle',
    mode: 'push',
    volume: 0.9,
    controlsVisible: true,
    petBounds: null
  }
};

let cache = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    cache = {
      apis: { ...DEFAULTS.apis, ...(raw.apis || {}) },
      prefs: { ...DEFAULTS.prefs, ...(raw.prefs || {}) },
      // { asr: {enc}, llm: {enc}, tts: {enc} } —— 只存密文 base64
      keys: raw.keys || {}
    };
  } catch {
    cache = JSON.parse(JSON.stringify(DEFAULTS));
    cache.keys = {};
  }
  return cache;
}

export function saveSettings(next) {
  const cur = loadSettings();
  if (next.apis) {
    for (const type of Object.keys(cur.apis)) {
      cur.apis[type] = { ...cur.apis[type], ...(next.apis[type] || {}) };
      if (next.apis[type] && typeof next.apis[type].key === 'string' && next.apis[type].key !== '') {
        setApiKey(type, next.apis[type].key);
      }
    }
  }
  if (next.prefs) cur.prefs = { ...cur.prefs, ...next.prefs };
  const { keys, ...rest } = cur;
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...rest, keys }, null, 2), 'utf8');
  return cur;
}

export function updatePrefs(patch) {
  const cur = loadSettings();
  cur.prefs = { ...cur.prefs, ...patch };
  const { keys, ...rest } = cur;
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...rest, keys }, null, 2), 'utf8');
  return cur;
}

export function setApiKey(type, plain) {
  const cur = loadSettings();
  if (safeStorage.isEncryptionAvailable()) {
    cur.keys[type] = safeStorage.encryptString(plain).toString('base64');
  } else {
    // 无加密能力时降级明文（记录警告于返回值外的日志）
    console.warn('[store] safeStorage 不可用，API Key 将明文保存');
    cur.keys[type] = 'plain:' + plain;
  }
}

export function getApiKey(type) {
  const cur = loadSettings();
  const v = cur.keys[type];
  if (!v) return '';
  if (v.startsWith('plain:')) return v.slice(6);
  try {
    return safeStorage.decryptString(Buffer.from(v, 'base64'));
  } catch {
    return '';
  }
}

// 对外暴露的脱敏视图：永不返回 Key 明文
export function sanitizedView() {
  const cur = loadSettings();
  const apis = {};
  for (const type of Object.keys(cur.apis)) {
    apis[type] = {
      ...cur.apis[type],
      key: '',
      hasKey: Boolean(getApiKey(type))
    };
  }
  return { apis, prefs: cur.prefs };
}
