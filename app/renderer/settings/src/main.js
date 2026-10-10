// 设置窗口逻辑：API 配置表单、测试按钮、偏好持久化
import { API_TYPES, API_LABELS } from '../../../shared/constants.js';

const apiBlocks = document.getElementById('apiBlocks');

function buildApiBlocks(settings) {
  apiBlocks.innerHTML = '';
  for (const type of API_TYPES) {
    const conf = settings.apis[type] || {};
    const block = document.createElement('div');
    block.className = 'api-block';
    block.innerHTML = `
      <h3>${API_LABELS[type]}</h3>
      <div class="row"><label>服务地址</label><input data-type="${type}" data-field="baseUrl" value="${escapeHtml(conf.baseUrl || '')}" placeholder="https://api.example.com/v1" /></div>
      <div class="row"><label>API Key</label><input data-type="${type}" data-field="key" type="password" value="" placeholder="${conf.hasKey ? '已保存（输入新值可更换）' : '必填'}" /></div>
      <div class="row"><label>模型名</label><input data-type="${type}" data-field="model" value="${escapeHtml(conf.model || '')}" placeholder="${type === 'llm' ? '如 glm-4-flash' : type === 'asr' ? '如 glm-asr' : '如 cogtts'}" /></div>
      ${type === 'tts' ? `<div class="row"><label>音色</label><input data-type="tts" data-field="voice" value="${escapeHtml(conf.voice || 'alloy')}" placeholder="alloy" /></div>` : ''}
      <div class="row">
        <label></label>
        <button class="testbtn" data-test="${type}">测试</button>
        <span class="test-result" id="result-${type}"></span>
      </div>
    `;
    apiBlocks.appendChild(block);
  }
  apiBlocks.querySelectorAll('[data-test]').forEach(btn => {
    btn.addEventListener('click', async () => {
      // 测试前先保存当前表单（含新填的 Key），确保测试的是用户填的配置
      await collectAndSave(true);
      const type = btn.dataset.test;
      const out = document.getElementById('result-' + type);
      out.textContent = '测试中…';
      out.className = 'test-result';
      const r = await window.petAPI.apiTest(type);
      out.textContent = r.detail;
      out.className = 'test-result ' + (r.ok ? 'ok' : 'fail');
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function readPrefsFromForm() {
  return {
    theme: document.getElementById('theme').value,
    mode: document.getElementById('mode').value,
    topmost: document.getElementById('topmost').checked,
    controlsVisible: document.getElementById('controlsVisible').checked,
    petScale: Number(document.getElementById('petScale').value) / 100,
    volume: Number(document.getElementById('volume').value) / 100,
    persona: document.getElementById('persona').value.trim(),
    engineUrl: document.getElementById('engineUrl').value.trim()
  };
}

// 语音引擎状态文案
function engineStateText(s = {}) {
  const pct = s.progress && s.progress.total
    ? ` ${Math.min(100, Math.round(s.progress.received / s.progress.total * 100))}%`
    : '';
  switch (s.state) {
    case 'absent': return '未下载';
    case 'downloading': return `下载中${pct}（${fmtMB(s.progress?.received)} / ${fmtMB(s.progress?.total)}）`;
    case 'installed': return `已安装${s.version ? '（' + s.version + '）' : ''}，可预启动或等待首次合成时自动启动`;
    case 'starting': return s.detail || '启动中…';
    case 'ready': return `就绪（端口 ${s.port}）`;
    case 'error': return `错误：${s.detail || '未知'}`;
    default: return '未知';
  }
}

function fmtMB(bytes) {
  if (!bytes) return '0MB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function renderEngineState(s) {
  const el = document.getElementById('engineState');
  el.textContent = engineStateText(s);
  el.style.color = s.state === 'error' ? '#d64545' : s.state === 'ready' ? '#1a9e5c' : '#2a2f3a';
  document.getElementById('engineDownloadBtn').disabled = s.state === 'downloading';
  // 引擎未下载/下载中时预启动无意义：置灰（未下载时的其他操作给出明确错误提示）
  document.getElementById('engineStartBtn').disabled = s.state === 'absent' || s.state === 'downloading';
}

function fillPersonaCount() {
  document.getElementById('personaCount').textContent =
    String(document.getElementById('persona').value.trim().length);
}

function fillPrefs(prefs = {}) {
  document.getElementById('theme').value = prefs.theme || 'day';
  document.getElementById('mode').value = prefs.mode || 'push';
  document.getElementById('topmost').checked = !!prefs.topmost;
  document.getElementById('controlsVisible').checked = prefs.controlsVisible !== false;
  const sc = Math.round((Number(prefs.petScale) || 1) * 100);
  document.getElementById('petScale').value = sc;
  document.getElementById('petScaleVal').textContent = sc + '%';
  document.getElementById('volume').value = Math.round((prefs.volume ?? 0.9) * 100);
  document.getElementById('volumeVal').textContent = Math.round((prefs.volume ?? 0.9) * 100) + '%';
  document.getElementById('persona').value = String(prefs.persona || '');
  fillPersonaCount();
  document.getElementById('ttsType').value = prefs.ttsType || 'openai';
  if (document.getElementById('engineUrl').value.trim() === '') {
    document.getElementById('engineUrl').value = String(prefs.engineUrl || '');
  }
}

// 音色列表：models=[{name,enabled}]，选中当前启用项
function fillVoiceModels(models = [], enabledName = '') {
  const sel = document.getElementById('voiceModelList');
  sel.innerHTML = '';
  if (!models.length) {
    sel.innerHTML = '<option value="">（尚未导入）</option>';
    return;
  }
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.name + (m.enabled ? '（已启用）' : '');
    sel.appendChild(opt);
  }
  if (enabledName && models.some(m => m.name === enabledName)) sel.value = enabledName;
}

async function collectAndSave(silent = false) {
  const apis = {};
  apiBlocks.querySelectorAll('input[data-type]').forEach(inp => {
    const { type, field } = inp.dataset;
    apis[type] = apis[type] || {};
    apis[type][field] = inp.value.trim();
  });
  const view = await window.petAPI.settingsSave({ apis, prefs: readPrefsFromForm() });
  buildApiBlocks(view); // 刷新 Key 占位状态
  if (!silent) {
    document.getElementById('saveResult').textContent = '✓ 已保存';
    setTimeout(() => { document.getElementById('saveResult').textContent = ''; }, 2500);
  }
  return view;
}

async function init() {
  const view = await window.petAPI.settingsGet();
  buildApiBlocks(view);
  fillPrefs(view.prefs);
  fillVoiceModels(view.voiceModels || [], view.prefs?.voiceModel || '');

  document.getElementById('volume').addEventListener('input', e => {
    document.getElementById('volumeVal').textContent = e.target.value + '%';
  });
  document.getElementById('persona').addEventListener('input', fillPersonaCount);
  document.getElementById('topmost').addEventListener('change', async e => {
    await window.petAPI.prefsSet({ topmost: e.target.checked });
  });
  document.getElementById('controlsVisible').addEventListener('change', async e => {
    await window.petAPI.prefsSet({ controlsVisible: e.target.checked });
  });
  const scaleInput = document.getElementById('petScale');
  let lastSentScale = 0;
  scaleInput.addEventListener('input', async e => {
    // 拖动过程中实时应用大小
    document.getElementById('petScaleVal').textContent = e.target.value + '%';
    const v = Number(e.target.value) / 100;
    if (v === lastSentScale) return;
    lastSentScale = v;
    await window.petAPI.prefsSet({ petScale: v });
  });
  document.getElementById('saveBtn').addEventListener('click', () => collectAndSave(false));
  document.getElementById('engineDownloadBtn').addEventListener('click', async () => {
    // 先保存表单（含新填的下载地址），再发起下载
    await collectAndSave(true);
    const url = document.getElementById('engineUrl').value.trim();
    const msg = document.getElementById('engineMsg');
    msg.textContent = '';
    const r = await window.petAPI.engineDownload(url);
    msg.textContent = r.ok ? '✓ 引擎包就绪' : r.message;
    msg.className = 'test-result ' + (r.ok ? 'ok' : 'fail');
  });
  document.getElementById('engineStartBtn').addEventListener('click', async () => {
    const msg = document.getElementById('engineMsg');
    msg.textContent = '启动中…';
    msg.className = 'test-result';
    const r = await window.petAPI.engineStart();
    msg.textContent = r.ok ? '✓ 引擎已就绪' : r.message;
    msg.className = 'test-result ' + (r.ok ? 'ok' : 'fail');
  });
  window.petAPI.onEngineState(renderEngineState);
  window.petAPI.engineStatus().then(renderEngineState);

  // 音色：导入 / 启用 / 试听；合成路线切换即时生效
  document.getElementById('ttsType').addEventListener('change', async e => {
    await window.petAPI.prefsSet({ ttsType: e.target.value });
  });
  document.getElementById('voiceImportBtn').addEventListener('click', async () => {
    const msg = document.getElementById('voiceMsg');
    msg.className = 'test-result';
    msg.textContent = '导入中…';
    const r = await window.petAPI.voiceModelImport();
    if (r.canceled) { msg.textContent = ''; return; }
    msg.textContent = r.ok ? `✓ 已导入「${r.name}」` : r.message;
    msg.className = 'test-result ' + (r.ok ? 'ok' : 'fail');
    if (r.ok) fillVoiceModels(r.models, r.name);
  });
  document.getElementById('voiceEnableBtn').addEventListener('click', async () => {
    const msg = document.getElementById('voiceMsg');
    const name = document.getElementById('voiceModelList').value;
    if (!name) { msg.textContent = '请先导入音色模型'; msg.className = 'test-result fail'; return; }
    await window.petAPI.prefsSet({ voiceModel: name });
    // 启用即切换音色：引擎若在运行则停止，下次合成按新权重懒启动
    await window.petAPI.engineStop();
    const view = await window.petAPI.settingsGet();
    fillVoiceModels(view.voiceModels, name);
    msg.textContent = `✓ 已启用「${name}」`;
    msg.className = 'test-result ok';
  });
  document.getElementById('voicePreviewBtn').addEventListener('click', async () => {
    const msg = document.getElementById('voiceMsg');
    msg.textContent = '合成中（CPU 可能需要数秒到十几秒）…';
    msg.className = 'test-result';
    try {
      const wav = await window.petAPI.chatTts('你好，这是我合成后的声音，很高兴见到你。');
      msg.textContent = '✓ 试听播放中';
      msg.className = 'test-result ok';
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(wav);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      src.onended = () => ctx.close();
    } catch (e) {
      msg.textContent = e.message;
      msg.className = 'test-result fail';
    }
  });
  document.getElementById('clearBtn').addEventListener('click', async () => {
    await window.petAPI.chatClear();
    document.getElementById('clearBtn').textContent = '✓ 已清空';
    setTimeout(() => { document.getElementById('clearBtn').textContent = '清空对话上下文'; }, 2000);
  });

  // 主进程侧偏好变化（托盘操作）同步到表单
  window.petAPI.onPrefsChanged(prefs => fillPrefs(prefs));
}

init();
