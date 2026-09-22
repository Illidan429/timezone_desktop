# 桌宠伴侣（bili-desktop-pet）

B 站主播桌面宠物应用：图片立绘角色悬浮于桌面，眼神跟随鼠标、待机眨眼、语音驱动口型，并支持**语音聊天**（说话 → 语音识别 → 大模型回复 → 语音合成 → 角色开口播报）。

- 桌面宠物形态：透明置顶悬浮窗，角色可拖到任意位置（位置记忆），角色区域外鼠标点击穿透
- 语音聊天：AI 服务（ASR / LLM / TTS，OpenAI 兼容格式）由用户自行配置，设置页带逐项「测试」按钮；支持按键说话 / 免提监听 / 文字输入三种模式
- 素材与代码分离：换角色只需按规范替换素材包，不改代码

## 环境要求

- Node.js 20+
- Windows 10/11 x64（开发与打包均在 Windows 上进行）

## 构建与运行

```sh
npm install          # 国内网络建议：ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm run gen:assets   # 生成占位素材包（首次）
npm run dev          # 打包渲染端并启动应用
npm run smoke        # 自动化冒烟自检（窗口/渲染/视线/眨眼/口型/播放/穿透等）
npm run dist         # 打包 Windows 安装包 + 便携版 → dist/
```

## 使用

1. 启动后角色出现在桌面右下角，按住角色可拖动；点击托盘图标可显示/隐藏。
2. 托盘菜单：显示/隐藏角色、打开设置、窗口置顶、姿态切换、退出。
3. 角色下方控制条（光标靠近时出现）：切换输入模式、按住 🎤 说话、打字发送、打开设置。
4. 语音聊天前请先在**设置**中配置三类服务（OpenAI 兼容格式）：
   - 大模型 LLM：服务地址 + API Key + 模型名（如 `https://open.bigmodel.cn/api/paas/v4` + `glm-4-flash`）
   - 语音识别 ASR：同上（如 `https://open.bigmodel.cn/api/paas/v4` + `glm-asr`）
   - 语音合成 TTS：同上（如 `cogtts`），可选音色
   - 每项配置后点击「测试」验证可用性；失败会按 网络/鉴权/模型名 分类提示。
5. 播放中点击角色或发起新输入即可打断；设置页可清空对话上下文、切换日夜主题。

## 换角色 / 素材制作

见 [docs/asset-spec.md](docs/asset-spec.md)：目录结构、manifest 清单格式、用 Live2D Cubism 录制各帧的方法、对齐要求。应用自带占位素材（`npm run gen:assets` 重新生成），正式素材按规范替换 `assets-app/default/` 即可。

**版权提醒**：素材必须自绘或已获授权；`reference/` 参考项目的素材有独立授权，禁止复制使用。

## 项目结构

```
app/
  main/        # Electron 主进程：窗口/托盘/协议/设置存储/网络代理
  renderer/    # pet（宠物窗口）与 settings（设置窗口）
  shared/      # 共享常量
assets-app/    # 素材包（manifest 驱动）
scripts/       # 占位素材生成、渲染端打包
docs/          # 素材接入规范
openspec/      # 规格与变更管理（OpenSpec 工作流）
```

## 开发说明

- 主进程为 ESM（`"type": "module"`）；渲染端用 esbuild 打包为经典脚本（`npm run build:ui`），规避自定义协议上的 ESM 模块限制
- 页面与素材经自定义协议 `app://` 提供服务（`app://pet/`、`app://settings/`、`app://assets/`、`app://shared/`）
- API Key 经 Electron safeStorage 加密存储于用户目录，界面不回显；所有外部 AI 请求由主进程代理发起
- 规格与开发流程由 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 管理，见 `openspec/` 与 `AGENTS.md`

## 规划中（后续迭代）

Agent HTTP 接入协议、歌词/音乐舞台、B 站直播弹幕互动、更多视觉特效。
