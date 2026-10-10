# 任务：AI 陪伴桌宠重聚焦

## 1. 聊天 UI 恢复（先行，解锁后续全部）

- [x] 1.1 以 `eadf4ae` 卸载提交为蓝本恢复宠物页聊天操作栏与字幕框（三模式切换、按住说话、文字输入、状态行），逐文件核对该提交之后的其他改动并保留（验证：`npm run dev` 可见操作栏与字幕框，三种模式可切换且选择重启后保持）
- [x] 1.2 恢复设置页聊天区块（ASR / LLM / TTS 三类 API 配置、测试按钮），保留期间加入的大小滑杆等设置项（验证：填写配置后点测试，成功/失败分类提示正确）
- [x] 1.3 冒烟自检补回聊天 UI 断言（操作栏/字幕框存在、模式持久化、打断代际）（验证：`npm run smoke` 全绿；顺带修复了既有的眨眼断言定时器节流假失败，改为轮询观察式）

## 2. 聊天人设（persona）

- [x] 2.1 `app/shared/constants.js` 新增 `DEFAULT_PERSONA`；prefs 支持 `persona` 字段读写（验证：全新 userData 下人设读取返回默认值）
- [x] 2.2 `proxy.chatComplete` 在主进程统一注入 system prompt（`prefs.persona` 优先，空值回退默认）（验证：冒烟断言 buildLlmMessages 三分支——默认回退/自定义优先/调用方 system 过滤）
- [x] 2.3 设置页新增人设编辑区（多行文本、保存、字数提示）（验证：编辑保存并重启后对话体现新人设；清空保存后回退默认人设——持久化冒烟已覆盖，对话体现需真实 API）
- [ ] 2.4 多轮对话人设保持验证（验证：连续多轮对话回复的自称与语气一致）——注入机制已就位（每次 chat:llm 均带人设），待真实 LLM API 验收

## 3. 语音引擎（voice-engine）

- [x] 3.1 主进程新增 EngineManager 状态机模块（absent → downloading → installed → starting → ready → error）（验证：用 stub 引擎注入各状态，流转与事件通知正确）
- [x] 3.2 引擎包下载安装：`net.fetch` 流式下载 + 进度事件 + 大小/SHA-256 校验 + 轻量纯 JS unzip 依赖 + 下载地址设置项（验证：对本地 HTTP 服务的测试包完成下载→校验→解压；损坏包明确报错且可重新下载）
- [x] 3.3 子进程监督：按 `engine.json` 契约懒启动 api_v2、`/ping` 探活上限 90 秒、端口占用自动顺延、崩溃重启 ≤3 次、退出时 `taskkill /T` 清理进程树（验证：stub 引擎分别模拟正常启动、假崩溃、端口占用、随应用退出，各场景行为正确且无残留进程——探针 scripts/probe-engine.mjs 七项全过）
- [x] 3.4 设置页语音引擎区块：状态实时显示（未下载/下载中/启动中/就绪/错误）、下载/重新下载/修复按钮、预启动热身入口（验证：手动走查各状态下文案与按钮可用性）
- [x] 3.5 编写 `docs/voice-engine-spec.md` 引擎包制作规范（目录布局、engine.json 字段、启动参数约定、制作步骤）（验证：按文档可制作出被 3.2/3.3 接受的引擎包）

## 4. 固定音色（voice-model）

- [x] 4.1 音色模型导入入库：文件选择 → 复制到 `userData/voice-models/<name>/model/` → 写 `voice.json`（验证：导入后目录与清单正确，重启后仍显示已导入——探针覆盖导入校验/缺文件报错/入库结构）
- [x] 4.2 引擎启动参数接入启用模型（`-g` / `-s` 权重路径）；未导入模型时音色区块明确提示（验证：探针断言桩引擎收到的启动参数与启用模型权重路径一致；冒烟断言未导入音色时 chatTts 报错含"音色"）
- [x] 4.3 TTS provider 分支：`ttsType` 支持 gptsovits（全新安装默认）/ openai；gptsovits 合成走引擎 `/tts` 返回 WAV 接入现有播放队列与口型同步；引擎未就绪时行内提示原因、不静默、不自动回退云端（验证：冒烟走桩引擎全链路——应用内下载→启用音色→chatTts 返回 RIFF WAV→入播放队列 onStart/playing 全真）
- [x] 4.4 设置页音色区块：导入 / 启用 / 试听（固定示例文本）+ TTS 类型切换；升级用户 `ttsType` 缺省按 openai 延续现状并在界面引导切换（验证：probe-migration 两模式通过——legacy 迁移 openai、fresh 默认 gptsovits；试听/切换走设置页接线）

## 5. 集成验证与交付

- [x] 5.1 冒烟扩展：stub 引擎覆盖状态机、端口顺延、崩溃重启、合成接入播放链路，及人设注入断言；全程离线可跑（验证：`npm run smoke` 全绿——应用内引擎端到端；进程监督场景由 `npm run probe:engine` 探针覆盖，同样离线）
- [ ] 5.2 端到端人工清单（需真实引擎包与音色模型，由委托人提供后执行）：下载 → 启动 → 导入模型 → 三模式对话 → 固定音色回复口型同步（验证：清单逐项通过）——按 docs/voice-engine-spec.md §6 准备音色包后执行
- [x] 5.3 CREDITS 署名 GPT-SoVITS（MIT），README 补语音引擎说明（验证：文档就位）
- [x] 5.4 打包分发验证：dist 安装包/便携版可启动，聊天 UI 可见，语音引擎未下载时功能置灰不报错（验证：`桌宠伴侣-{setup,portable}-0.2.0.exe` 产物生成，便携版实测启动进程存活；桌面快捷方式已指向 0.2.0）
- [x] 5.5 收尾处置：归档被取代的 `gpt-sovits-voice-engine` 变更（不合并其规格增量，内容已由本变更承接简化）；`bili-streamer-desktop-app` 按其自身验收进度独立归档（验证：`openspec list` 状态与预期一致——archive/2026-10-11-gpt-sovits-voice-engine）
