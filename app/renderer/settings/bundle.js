(() => {
  // app/renderer/settings/src/main.js
  function readPrefsFromForm() {
    return {
      theme: document.getElementById("theme").value,
      topmost: document.getElementById("topmost").checked,
      controlsVisible: document.getElementById("controlsVisible").checked,
      petScale: Number(document.getElementById("petScale").value) / 100
    };
  }
  function fillPrefs(prefs = {}) {
    document.getElementById("theme").value = prefs.theme || "day";
    document.getElementById("topmost").checked = !!prefs.topmost;
    document.getElementById("controlsVisible").checked = prefs.controlsVisible !== false;
    const sc = Math.round((Number(prefs.petScale) || 1) * 100);
    document.getElementById("petScale").value = sc;
    document.getElementById("petScaleVal").textContent = sc + "%";
  }
  async function saveSettings() {
    await window.petAPI.prefsSet(readPrefsFromForm());
    document.getElementById("saveResult").textContent = "\u2713 \u5DF2\u4FDD\u5B58";
    setTimeout(() => {
      document.getElementById("saveResult").textContent = "";
    }, 2500);
  }
  async function init() {
    const view = await window.petAPI.settingsGet();
    fillPrefs(view.prefs);
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
    document.getElementById("saveBtn").addEventListener("click", saveSettings);
    window.petAPI.onPrefsChanged((prefs) => fillPrefs(prefs));
  }
  init();
})();
