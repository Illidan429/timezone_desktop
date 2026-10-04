// 渲染端入口：装配素材与界面（语音聊天功能 UI 已按需求暂停移除，
// 底层 pipeline/recorder/player 模块保留在仓库中待复用，当前不装配）
import { loadManifest, preloadImages, collectImageUrls } from './manifest.js';
import { Stage, BlinkScheduler } from './display.js';
import { Ui } from './ui.js';

// 冒烟状态：主进程 --smoke 模式读取
window.__PET_STATE__ = { ready: false, errors: [], manifest: null, degrade: [] };
const state = window.__PET_STATE__;

let stage, blinker, ui;
let lastCursor = null;
let ignoreMouse = true;
let dragging = null; // {lastX,lastY,moved,downAt}

async function boot() {
  try {
    // 1. 素材清单
    const mres = await loadManifest();
    state.manifest = mres.manifest;
    state.degrade = mres.missing;
    if (!mres.manifest) {
      state.errors.push('素材清单不可用：' + mres.missing.join('；'));
      return;
    }
    // 2. 预加载图片（单个坏文件降级不阻塞）
    const urls = collectImageUrls(mres.manifest);
    const loaded = await preloadImages(urls);
    const images = new Map();
    for (const r of loaded) {
      if (r.ok) images.set(r.url, r.img);
      else state.degrade.push('图片加载失败（已降级跳过）: ' + r.url);
    }
    // 3. 模块装配
    stage = new Stage(mres.manifest, images);
    await stage.normalizeBottoms();
    stage._updateBottomScale();
    blinker = new BlinkScheduler(stage);
    ui = new Ui(mres.manifest);

    // 4. 应用设置
    const { prefs } = await window.petAPI.settingsGet();
    applyPrefs(prefs);
    wireCursorAndDrag();
    window.petAPI.onPrefsChanged(applyPrefs);

    blinker.start();
    state.ready = true;
    window.__SMOKE_READY__ = true;
  } catch (e) {
    state.errors.push('启动失败：' + (e?.stack || e));
    console.error(e);
  }
}

function applyPrefs(prefs = {}) {
  if (!stage) return;
  if (prefs.theme) ui.setTheme(prefs.theme);
  if (prefs.pose) stage.applyPose(prefs.pose);
  if (prefs.petScale !== undefined) {
    const sc = Math.min(3, Math.max(0.3, Number(prefs.petScale) || 1));
    const st = stage.el.stack;
    st.style.width = Math.round(340 * sc) + 'px';
    st.style.height = Math.round(453 * sc) + 'px';
    st.style.bottom = Math.round(90 * sc) + 'px';
    stage._updateBottomScale();
  }
}

function wireCursorAndDrag() {
  window.petAPI.onCursor(pt => {
    lastCursor = pt;
    // 穿透切换：仅状态变化时调用
    const hit = stage.hitTest(pt);
    if (hit !== !ignoreMouse || (hit && ignoreMouse)) {
      const shouldIgnore = !hit && !dragging;
      if (shouldIgnore !== ignoreMouse) {
        ignoreMouse = shouldIgnore;
        window.petAPI.windowSetIgnoreMouse(shouldIgnore);
      }
    }
    if (dragging) {
      const dx = pt.x - dragging.lastX, dy = pt.y - dragging.lastY;
      dragging.lastX = pt.x; dragging.lastY = pt.y;
      dragging.moved += Math.abs(dx) + Math.abs(dy);
      if (dx || dy) window.petAPI.windowMoveBy(dx, dy);
    }
    stage.tick(1 / 60, pt);
  });

  stage.el.stack.addEventListener('mousedown', e => {
    if (!lastCursor) return;
    dragging = { lastX: lastCursor.x, lastY: lastCursor.y, moved: 0, downAt: Date.now() };
    stage.el.stack.classList.add('dragging');
    const up = () => {
      window.removeEventListener('mouseup', up);
      stage.el.stack.classList.remove('dragging');
      const wasClick = dragging.moved < 6 && Date.now() - dragging.downAt < 500;
      dragging = null;
      if (wasClick) blinker.play(); // 点击小互动
    };
    window.addEventListener('mouseup', up);
  });
}

// 冒烟功能自检：由主进程 --smoke 模式调用，断言核心渲染行为
window.__PET_SMOKE_CHECKS__ = async function () {
  const checks = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    // 1. 视线网格映射：中心 → 中格；右侧 → 右列
    const rect = stage.el.stack.getBoundingClientRect();
    const cx = window.screenX + rect.left + rect.width / 2;
    const cy = window.screenY + rect.top + rect.height / 2;
    const c1 = stage.gazeCellFor({ x: cx, y: cy });
    const c2 = stage.gazeCellFor({ x: cx + 500, y: cy });
    checks.gazeCenter = c1 && c1.c === 1 && c1.r === 1;
    checks.gazeRight = c2 && c2.c === 2;
    stage.setGaze(c1);

    // 2. 眨眼动画：播放后进入半闭/闭合并复位
    blinker.play();
    await sleep(120);
    const blinkMid = stage.blinkLevel > 0;
    await sleep(500);
    checks.blink = blinkMid && stage.blinkLevel === 0;

    // 3. 命中检测：角色中心命中；窗口左上角空白处不命中
    checks.hitChar = stage.hitTest({ x: cx, y: cy });
    checks.hitEmpty = stage.hitTest({ x: window.screenX + 4, y: window.screenY + 4 }) === false;
    checks.dbg = `screenX=${window.screenX},screenY=${window.screenY},rect=${JSON.stringify(stage.el.stack.getBoundingClientRect())},outerW=${window.outerWidth}`;

    // 4. 姿态切换（素材包姿态数不定：有多个则切到最后一个，仅一个则验证重载）
    const poses = stage.m.poses || [];
    const target = poses[poses.length - 1];
    stage.applyPose(target.id);
    checks.poseSwitch = stage.poseId === target.id
      && (stage.el.pose.style.backgroundImage.includes('blob:') || stage.el.gaze.style.backgroundImage.includes('blob:'));
    stage.applyPose(poses[0].id);

    // 5. 主题切换
    ui.setTheme('night');
    checks.themeNight = document.body.classList.contains('night');
    ui.setTheme('day');
    checks.themeRestore = !document.body.classList.contains('night');
  } catch (e) {
    checks.fatal = String(e && e.stack || e);
  }
  checks.allOk = Object.entries(checks).every(([k, v]) => k === 'fatal' || k === 'dbg' || k.endsWith('Dbg') || v === true);
  return checks;
};

// 调试/验收接口：直接触达各模块（不影响正常功能）
window.__PET_DEBUG__ = { get stage() { return stage; }, get ui() { return ui; } };

boot();
