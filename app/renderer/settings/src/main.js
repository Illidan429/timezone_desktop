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
    volume: Number(document.getElementById('volume').value) / 100
  };
}

function fillPrefs(prefs = {}) {
  document.getElementById('theme').value = prefs.theme || 'day';
  document.getElementById('mode').value = prefs.mode || 'push';
  document.getElementById('topmost').checked = !!prefs.topmost;
  document.getElementById('volume').value = Math.round((prefs.volume ?? 0.9) * 100);
  document.getElementById('volumeVal').textContent = Math.round((prefs.volume ?? 0.9) * 100) + '%';
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

  document.getElementById('volume').addEventListener('input', e => {
    document.getElementById('volumeVal').textContent = e.target.value + '%';
  });
  document.getElementById('topmost').addEventListener('change', async e => {
    await window.petAPI.prefsSet({ topmost: e.target.checked });
  });
  document.getElementById('saveBtn').addEventListener('click', () => collectAndSave(false));
  document.getElementById('clearBtn').addEventListener('click', async () => {
    await window.petAPI.chatClear();
    document.getElementById('clearBtn').textContent = '✓ 已清空';
    setTimeout(() => { document.getElementById('clearBtn').textContent = '清空对话上下文'; }, 2000);
  });

  // 主进程侧偏好变化（托盘操作）同步到表单
  window.petAPI.onPrefsChanged(prefs => fillPrefs(prefs));
}

init();
