# 设计：B 站主播桌面宠物（图片立绘 + 语音聊天）

## Context

仓库现有只读参考项目（`reference/midori-companion-avatar-main/`，MIT 代码 + 独立授权素材）与 OpenSpec 脚手架，无业务代码。参考项目验证了图片方案的角色渲染：方向集帧表达视线朝向、眨眼帧序列、音频响度驱动口型帧；前端为原生 JS（单文件 212KB）。

需求演进中确定的边界：交付形态为**桌面宠物**（透明悬浮、可拖动、区域外穿透）；角色渲染用**图片素材方案**（Live2D 方案因"模型文件随应用分发即泄露 + 再分发授权受限"被否决）；**语音聊天**为核心能力，AI 服务由最终用户自行配置。

## Goals / Non-Goals

**Goals:**
- 透明置顶宠物窗口：拖动跟手、区域外鼠标穿透、位置记忆
- 图片素材全清单驱动，换角色零代码改动；占位素材保证无素材可开发
- 语音聊天开箱可配：用户填 API（OpenAI 兼容）→ 测试按钮验证 → 三种交互模式
- 主进程与渲染端职责清晰：密钥与外部请求收敛在主进程

**Non-Goals:**
- 不做 Live2D（已在提案阶段否决，理由见 Context）
- 不做 Agent HTTP 接口、歌词舞台、星空特效、B 站弹幕互动（后续迭代）
- 不内置任何 AI 服务的默认 Key；不做唤醒词识别（免提模式用 VAD 静默检测即可）
- 首版仅 Windows 打包

## Decisions

### D1：应用壳 —— Electron（备选：Tauri、pywebview）

选 Electron + electron-builder。透明无边框窗口、`setIgnoreMouseEvents` 鼠标穿透、托盘、单实例锁、NSIS 打包均为官方成熟能力；备选方案在透明窗口穿透与音频设备控制上生态更弱。体积代价（安装包约 80–120MB）对桌面宠物应用可接受。

### D2：穿透与拖动 —— 渲染端命中检测 + 主进程切换穿透

窗口整体透明无边框。渲染端维护角色不透明区域的包围盒（含容差），鼠标移动时经 `setIgnoreMouseEvents(ignore, { forward: true })` 动态切换：角色区域外开启穿透（事件仍转发给渲染端用于视线跟随），角色区域内关闭穿透以支持拖动与点击。拖动用渲染端捕获鼠标位移驱动主进程 `setPosition`。备选的 Win32 命中测试（`WM_NCHITTEST`）实现复杂、跨版本行为差异大，不采用。

### D3：角色渲染 —— 分层精灵，复用参考项目架构

DOM/Canvas 分层：立绘层（姿态 PNG）+ 视线层（方向集帧：按鼠标相对方位选帧 + 1–3px 微位移）+ 眨眼层（帧序列覆盖）+ 口型层（闭/半/全帧按响度切换）+ 主题氛围层（夜间星光等轻量粒子）。渲染循环 `requestAnimationFrame`，素材全部来自 manifest。与参考项目 `app.js` 同构，但其单文件模式改为模块化拆分（`display/`、`audio/`、`chat/`、`settings/`）。

> 实现记录：渲染端模块原计划以原生 ESM 直载，但 Electron 自定义协议（app://）上的 ES 模块加载器存在兼容限制（动态导入报 "Failed to fetch dynamically imported module"，经 corsEnabled 等特权与直读 Response 均无法绕过）。实现改为 **esbuild 将两个渲染端入口打包为经典 IIFE 脚本**（`npm run build:ui`，毫秒级），主进程保持原生 ESM。该决策影响实现方式，不影响任何规格行为。

### D4：口型与音频 —— Web Audio AnalyserNode

播放统一走 `AudioContext`，`AnalyserNode` 取瞬时 RMS 映射口型帧档位（闭/半/全），停止后回闭口帧。测试音内置（无 API 依赖），用于验声与口型自检。

### D5：素材包 —— 目录 + manifest（沿用第一版方案）

`assets-app/<character>/` 根目录 + `manifest.json`（立绘/姿态、方向集帧序、眨眼序列、口型帧、主题、测试音的入口与默认值）；加载器做缺字段提示与单文件损坏降级（见 asset-pipeline 规格）。占位素材程序化生成（SVG→PNG），体积 < 5MB。

### D6：语音聊天 —— 用户配置 + 主进程代理 + OpenAI 兼容端点

- **端点约定**：LLM `POST {base}/chat/completions`；ASR `POST {base}/audio/transcriptions`；TTS `POST {base}/audio/speech`（OpenAI 兼容，主流国内服务商均支持）。兼容参数（如 TTS 音色）放高级设置。
- **密钥安全**：Key 经 Electron `safeStorage` 加密存盘；所有外部请求由**主进程**代理发起（Net 模块），渲染端只见"配置与状态"，不接触 Key、无 CORS 问题。
- **测试按钮**：每类配置发一次最小真实请求（LLM 1 token、ASR 上行 1 秒静音、TTS 合成 1 句短文本），按 HTTP 状态/错误体分类提示（网络、鉴权、模型名、配额）。
- **录音**：渲染端 `MediaRecorder`（webm/opus）；主进程侧保留 wav 转码兜底（部分 ASR 服务不收 webm）。
- **免提监听**：Web Audio 能量 VAD——超阈值判定开口，静默 ≥ 800ms 判定结束；不做唤醒词。
- **打断**：播放中点击角色或新输入 → 停止播放、清空队列、终止进行中的请求。
- **上下文**：主进程维护会话历史（默认保留最近 20 轮），随"清空对话"重置。

## Risks / Trade-offs

- [透明置顶窗口在全屏应用上的兼容性] → 置顶为可选项；全屏游戏场景下不承诺置顶生效，README 说明
- [穿透命中检测以包围盒近似角色轮廓] → 边缘少量误穿透/误拦截可接受；容差可配置
- [webm 录音与部分 ASR 服务不兼容] → wav 转码兜底，测试按钮可提前暴露
- [免提模式噪音环境误触发] → 阈值可调 + 默认关闭免提，按键说话为默认模式
- [图片素材随应用分发仍可被提取] → 用户已知悉并选择图片方案（价值密度低、重制容易）；素材授权由项目方在素材到位前落实
- [Electron 包体积] → 接受，README 注明

## Migration Plan

纯新增项目，无存量迁移。发布：`npm run build` → 安装包/便携版 → 冒烟清单（启动、拖动、穿透、语音链路）→ 发布；回滚即回退上一版安装包。

## Open Questions

- TTS 音色/语速等高级参数是否需要进首版设置页——按"高级设置折叠项"处理，不做阻塞依赖

> 已解决：正式素材来源确认——用户从自有 Live2D 模型导出/录制任意所需形态（立绘、眨眼帧、方向帧、口型帧），无授权障碍。录制清单以 `docs/asset-spec.md`（任务 3.1）为准。
