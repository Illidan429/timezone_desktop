(() => {
  // app/shared/constants.js
  var API_TYPES = ["asr", "llm", "tts"];
  var API_LABELS = {
    asr: "\u8BED\u97F3\u8BC6\u522B (ASR)",
    llm: "\u5927\u6A21\u578B (LLM)",
    tts: "\u8BED\u97F3\u5408\u6210 (TTS)"
  };
  var DEFAULT_PERSONA = [
    "\u4F60\u662F\u300C\u684C\u5BA0\u5C11\u5973\u300D\uFF0C\u4E00\u4E2A\u4F4F\u5728\u7528\u6237\u684C\u9762\u4E0A\u7684 AI \u4F19\u4F34\uFF0C\u6027\u683C\u5F00\u6717\u6E29\u67D4\u3001\u4F53\u8D34\u4F46\u4E0D\u5570\u55E6\uFF0C\u5076\u5C14\u5E26\u70B9\u5C0F\u4FCF\u76AE\u3002",
    "\u7528\u8F7B\u677E\u81EA\u7136\u7684\u4E2D\u6587\u53E3\u8BED\u548C\u7528\u6237\u804A\u5929\uFF1A\u79F0\u547C\u7528\u6237\u4E3A\u300C\u4F60\u300D\uFF0C\u81EA\u79F0\u300C\u6211\u300D\u3002",
    "\u56DE\u590D\u4FDD\u6301\u7B80\u77ED\uFF08\u901A\u5E38 1~3 \u53E5\u8BDD\uFF09\uFF0C\u9002\u5408\u6717\u8BFB\u51FA\u6765\uFF1B\u4E0D\u8981\u4F7F\u7528 Markdown\u3001\u5217\u8868\u6216\u8868\u60C5\u7B26\u53F7\u3002",
    "\u7528\u6237\u9700\u8981\u5E2E\u52A9\u65F6\u8010\u5FC3\u8BB2\u6E05\u695A\uFF0C\u4E5F\u613F\u610F\u542C\u7528\u6237\u5206\u4EAB\u65E5\u5E38\u3002"
  ].join("");

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
      petScale: Number(document.getElementById("petScale").value) / 100,
      volume: Number(document.getElementById("volume").value) / 100,
      persona: document.getElementById("persona").value.trim(),
      engineUrl: document.getElementById("engineUrl").value.trim()
    };
  }
  function engineStateText(s = {}) {
    const pct = s.progress && s.progress.total ? ` ${Math.min(100, Math.round(s.progress.received / s.progress.total * 100))}%` : "";
    switch (s.state) {
      case "absent":
        return "\u672A\u4E0B\u8F7D";
      case "downloading":
        return `\u4E0B\u8F7D\u4E2D${pct}\uFF08${fmtMB(s.progress?.received)} / ${fmtMB(s.progress?.total)}\uFF09`;
      case "installed":
        return `\u5DF2\u5B89\u88C5${s.version ? "\uFF08" + s.version + "\uFF09" : ""}\uFF0C\u53EF\u9884\u542F\u52A8\u6216\u7B49\u5F85\u9996\u6B21\u5408\u6210\u65F6\u81EA\u52A8\u542F\u52A8`;
      case "starting":
        return s.detail || "\u542F\u52A8\u4E2D\u2026";
      case "ready":
        return `\u5C31\u7EEA\uFF08\u7AEF\u53E3 ${s.port}\uFF09`;
      case "error":
        return `\u9519\u8BEF\uFF1A${s.detail || "\u672A\u77E5"}`;
      default:
        return "\u672A\u77E5";
    }
  }
  function fmtMB(bytes) {
    if (!bytes) return "0MB";
    return (bytes / 1024 / 1024).toFixed(1) + "MB";
  }
  function renderEngineState(s) {
    const el = document.getElementById("engineState");
    el.textContent = engineStateText(s);
    el.style.color = s.state === "error" ? "#d64545" : s.state === "ready" ? "#1a9e5c" : "#2a2f3a";
    document.getElementById("engineDownloadBtn").disabled = s.state === "downloading";
    document.getElementById("engineStartBtn").disabled = s.state === "absent" || s.state === "downloading";
  }
  function fillPersonaCount() {
    document.getElementById("personaCount").textContent = String(document.getElementById("persona").value.trim().length);
  }
  function fillPrefs(prefs = {}) {
    document.getElementById("theme").value = prefs.theme || "day";
    document.getElementById("mode").value = prefs.mode || "push";
    document.getElementById("topmost").checked = !!prefs.topmost;
    document.getElementById("controlsVisible").checked = prefs.controlsVisible !== false;
    const sc = Math.round((Number(prefs.petScale) || 1) * 100);
    document.getElementById("petScale").value = sc;
    document.getElementById("petScaleVal").textContent = sc + "%";
    document.getElementById("volume").value = Math.round((prefs.volume ?? 0.9) * 100);
    document.getElementById("volumeVal").textContent = Math.round((prefs.volume ?? 0.9) * 100) + "%";
    document.getElementById("persona").value = String(prefs.persona || "");
    fillPersonaCount();
    document.getElementById("ttsType").value = prefs.ttsType || "openai";
    if (document.getElementById("engineUrl").value.trim() === "") {
      document.getElementById("engineUrl").value = String(prefs.engineUrl || "");
    }
  }
  function fillVoiceModels(models = [], enabledName = "") {
    const sel = document.getElementById("voiceModelList");
    sel.innerHTML = "";
    if (!models.length) {
      sel.innerHTML = '<option value="">\uFF08\u5C1A\u672A\u5BFC\u5165\uFF09</option>';
      return;
    }
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.name;
      opt.textContent = m.name + (m.enabled ? "\uFF08\u5DF2\u542F\u7528\uFF09" : "");
      sel.appendChild(opt);
    }
    if (enabledName && models.some((m) => m.name === enabledName)) sel.value = enabledName;
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
    fillVoiceModels(view.voiceModels || [], view.prefs?.voiceModel || "");
    document.getElementById("volume").addEventListener("input", (e) => {
      document.getElementById("volumeVal").textContent = e.target.value + "%";
    });
    document.getElementById("persona").addEventListener("input", fillPersonaCount);
    document.getElementById("topmost").addEventListener("change", async (e) => {
      await window.petAPI.prefsSet({ topmost: e.target.checked });
    });
    document.getElementById("controlsVisible").addEventListener("change", async (e) => {
      await window.petAPI.prefsSet({ controlsVisible: e.target.checked });
    });
    const scaleInput = document.getElementById("petScale");
    let lastSentScale = 0;
    scaleInput.addEventListener("input", async (e) => {
      document.getElementById("petScaleVal").textContent = e.target.value + "%";
      const v = Number(e.target.value) / 100;
      if (v === lastSentScale) return;
      lastSentScale = v;
      await window.petAPI.prefsSet({ petScale: v });
    });
    document.getElementById("saveBtn").addEventListener("click", () => collectAndSave(false));
    document.getElementById("engineDownloadBtn").addEventListener("click", async () => {
      await collectAndSave(true);
      const url = document.getElementById("engineUrl").value.trim();
      const msg = document.getElementById("engineMsg");
      msg.textContent = "";
      const r = await window.petAPI.engineDownload(url);
      msg.textContent = r.ok ? "\u2713 \u5F15\u64CE\u5305\u5C31\u7EEA" : r.message;
      msg.className = "test-result " + (r.ok ? "ok" : "fail");
    });
    document.getElementById("engineStartBtn").addEventListener("click", async () => {
      const msg = document.getElementById("engineMsg");
      msg.textContent = "\u542F\u52A8\u4E2D\u2026";
      msg.className = "test-result";
      const r = await window.petAPI.engineStart();
      msg.textContent = r.ok ? "\u2713 \u5F15\u64CE\u5DF2\u5C31\u7EEA" : r.message;
      msg.className = "test-result " + (r.ok ? "ok" : "fail");
    });
    window.petAPI.onEngineState(renderEngineState);
    window.petAPI.engineStatus().then(renderEngineState);
    document.getElementById("ttsType").addEventListener("change", async (e) => {
      await window.petAPI.prefsSet({ ttsType: e.target.value });
    });
    document.getElementById("voiceImportBtn").addEventListener("click", async () => {
      const msg = document.getElementById("voiceMsg");
      msg.className = "test-result";
      msg.textContent = "\u5BFC\u5165\u4E2D\u2026";
      const r = await window.petAPI.voiceModelImport();
      if (r.canceled) {
        msg.textContent = "";
        return;
      }
      msg.textContent = r.ok ? `\u2713 \u5DF2\u5BFC\u5165\u300C${r.name}\u300D` : r.message;
      msg.className = "test-result " + (r.ok ? "ok" : "fail");
      if (r.ok) fillVoiceModels(r.models, r.name);
    });
    document.getElementById("voiceEnableBtn").addEventListener("click", async () => {
      const msg = document.getElementById("voiceMsg");
      const name = document.getElementById("voiceModelList").value;
      if (!name) {
        msg.textContent = "\u8BF7\u5148\u5BFC\u5165\u97F3\u8272\u6A21\u578B";
        msg.className = "test-result fail";
        return;
      }
      await window.petAPI.prefsSet({ voiceModel: name });
      await window.petAPI.engineStop();
      const view2 = await window.petAPI.settingsGet();
      fillVoiceModels(view2.voiceModels, name);
      msg.textContent = `\u2713 \u5DF2\u542F\u7528\u300C${name}\u300D`;
      msg.className = "test-result ok";
    });
    document.getElementById("voicePreviewBtn").addEventListener("click", async () => {
      const msg = document.getElementById("voiceMsg");
      msg.textContent = "\u5408\u6210\u4E2D\uFF08CPU \u53EF\u80FD\u9700\u8981\u6570\u79D2\u5230\u5341\u51E0\u79D2\uFF09\u2026";
      msg.className = "test-result";
      try {
        const wav = await window.petAPI.chatTts("\u4F60\u597D\uFF0C\u8FD9\u662F\u6211\u5408\u6210\u540E\u7684\u58F0\u97F3\uFF0C\u5F88\u9AD8\u5174\u89C1\u5230\u4F60\u3002");
        msg.textContent = "\u2713 \u8BD5\u542C\u64AD\u653E\u4E2D";
        msg.className = "test-result ok";
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(wav);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
        src.onended = () => ctx.close();
      } catch (e) {
        msg.textContent = e.message;
        msg.className = "test-result fail";
      }
    });
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
