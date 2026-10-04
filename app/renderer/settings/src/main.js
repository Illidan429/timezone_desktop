// 设置窗口逻辑：外观与窗口行为偏好
function readPrefsFromForm() {
  return {
    theme: document.getElementById('theme').value,
    topmost: document.getElementById('topmost').checked,
    controlsVisible: document.getElementById('controlsVisible').checked,
    petScale: Number(document.getElementById('petScale').value) / 100
  };
}

function fillPrefs(prefs = {}) {
  document.getElementById('theme').value = prefs.theme || 'day';
  document.getElementById('topmost').checked = !!prefs.topmost;
  document.getElementById('controlsVisible').checked = prefs.controlsVisible !== false;
  const sc = Math.round((Number(prefs.petScale) || 1) * 100);
  document.getElementById('petScale').value = sc;
  document.getElementById('petScaleVal').textContent = sc + '%';
}

async function saveSettings() {
  await window.petAPI.prefsSet(readPrefsFromForm());
  document.getElementById('saveResult').textContent = '✓ 已保存';
  setTimeout(() => { document.getElementById('saveResult').textContent = ''; }, 2500);
}

async function init() {
  const view = await window.petAPI.settingsGet();
  fillPrefs(view.prefs);

  document.getElementById('topmost').addEventListener('change', async e => {
    await window.petAPI.prefsSet({ topmost: e.target.checked });
  });
  document.getElementById('controlsVisible').addEventListener('change', async e => {
    await window.petAPI.prefsSet({ controlsVisible: e.target.checked });
  });
  const scaleInput = document.getElementById('petScale');
  scaleInput.addEventListener('input', () => {
    document.getElementById('petScaleVal').textContent = scaleInput.value + '%';
  });
  scaleInput.addEventListener('change', async e => {
    await window.petAPI.prefsSet({ petScale: Number(e.target.value) / 100 });
  });
  document.getElementById('saveBtn').addEventListener('click', saveSettings);

  // 主进程侧偏好变化（托盘操作）同步到表单
  window.petAPI.onPrefsChanged(prefs => fillPrefs(prefs));
}

init();
