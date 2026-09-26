(() => {
  // app/shared/constants.js
  var API_TYPES = ["asr", "llm", "tts"];
  var API_LABELS = {
    asr: "\u8BED\u97F3\u8BC6\u522B (ASR)",
    llm: "\u5927\u6A21\u578B (LLM)",
    tts: "\u8BED\u97F3\u5408\u6210 (TTS)"
  };

  // app/renderer/settings/src/main.js
  var apiBlocks = document.getElementById("apiBlocks");
  function buildApiBlocks(settings) {
    apiBlocks.innerHTML = "";
    for (const type of API_TYPES) {
      const conf = settings.apis[type] || {};
      const block = document.createElement("div");
      block.className = "api-block";
      block.innerHTML = `
      <h3>${API_LABELS[type]}</h3>
      <div class="row"><label>\u670D\u52A1\u5730\u5740</label><input data-type="${type}" data-field="baseUrl" value="${escapeHtml(conf.baseUrl || "")}" placeholder="https://api.example.com/v1" /></div>
      <div class="row"><label>API Key</label><input data-type="${type}" data-field="key" type="password" value="" placeholder="${conf.hasKey ? "\u5DF2\u4FDD\u5B58\uFF08\u8F93\u5165\u65B0\u503C\u53EF\u66F4\u6362\uFF09" : "\u5FC5\u586B"}" /></div>
      <div class="row"><label>\u6A21\u578B\u540D</label><input data-type="${type}" data-field="model" value="${escapeHtml(conf.model || "")}" placeholder="${type === "llm" ? "\u5982 glm-4-flash" : type === "asr" ? "\u5982 glm-asr" : "\u5982 cogtts"}" /></div>
      ${type === "tts" ? `<div class="row"><label>\u97F3\u8272</label><input data-type="tts" data-field="voice" value="${escapeHtml(conf.voice || "alloy")}" placeholder="alloy" /></div>` : ""}
      <div class="row">
        <label></label>
        <button class="testbtn" data-test="${type}">\u6D4B\u8BD5</button>
        <span class="test-result" id="result-${type}"></span>
      </div>
    `;
      apiBlocks.appendChild(block);
    }
    apiBlocks.querySelectorAll("[data-test]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await collectAndSave(true);
        const type = btn.dataset.test;
        const out = document.getElementById("result-" + type);
        out.textContent = "\u6D4B\u8BD5\u4E2D\u2026";
        out.className = "test-result";
        const r = await window.petAPI.apiTest(type);
        out.textContent = r.detail;
        out.className = "test-result " + (r.ok ? "ok" : "fail");
      });
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function readPrefsFromForm() {
    return {
      theme: document.getElementById("theme").value,
      mode: document.getElementById("mode").value,
      topmost: document.getElementById("topmost").checked,
      controlsVisible: document.getElementById("controlsVisible").checked,
      volume: Number(document.getElementById("volume").value) / 100
    };
  }
  function fillPrefs(prefs = {}) {
    document.getElementById("theme").value = prefs.theme || "day";
    document.getElementById("mode").value = prefs.mode || "push";
    document.getElementById("topmost").checked = !!prefs.topmost;
    document.getElementById("controlsVisible").checked = prefs.controlsVisible !== false;
    document.getElementById("volume").value = Math.round((prefs.volume ?? 0.9) * 100);
    document.getElementById("volumeVal").textContent = Math.round((prefs.volume ?? 0.9) * 100) + "%";
  }
  async function collectAndSave(silent = false) {
    const apis = {};
    apiBlocks.querySelectorAll("input[data-type]").forEach((inp) => {
      const { type, field } = inp.dataset;
      apis[type] = apis[type] || {};
      apis[type][field] = inp.value.trim();
    });
    const view = await window.petAPI.settingsSave({ apis, prefs: readPrefsFromForm() });
    buildApiBlocks(view);
    if (!silent) {
      document.getElementById("saveResult").textContent = "\u2713 \u5DF2\u4FDD\u5B58";
      setTimeout(() => {
        document.getElementById("saveResult").textContent = "";
      }, 2500);
    }
    return view;
  }
  async function init() {
    const view = await window.petAPI.settingsGet();
    buildApiBlocks(view);
    fillPrefs(view.prefs);
    document.getElementById("volume").addEventListener("input", (e) => {
      document.getElementById("volumeVal").textContent = e.target.value + "%";
    });
    document.getElementById("topmost").addEventListener("change", async (e) => {
      await window.petAPI.prefsSet({ topmost: e.target.checked });
    });
    document.getElementById("saveBtn").addEventListener("click", () => collectAndSave(false));
    document.getElementById("clearBtn").addEventListener("click", async () => {
      await window.petAPI.chatClear();
      document.getElementById("clearBtn").textContent = "\u2713 \u5DF2\u6E05\u7A7A";
      setTimeout(() => {
        document.getElementById("clearBtn").textContent = "\u6E05\u7A7A\u5BF9\u8BDD\u4E0A\u4E0B\u6587";
      }, 2e3);
    });
    window.petAPI.onPrefsChanged((prefs) => fillPrefs(prefs));
  }
  init();
})();
