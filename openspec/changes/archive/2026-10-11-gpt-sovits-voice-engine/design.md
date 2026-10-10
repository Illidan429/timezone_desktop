# 设计：GPT-SoVITS 语音引擎集成（分离式语音包）

## Context

桌宠现有 TTS 为"用户配置的 OpenAI 兼容服务"（主进程代理请求）。本变更新增本地 GPT-SoVITS 引擎路线，交付形态为**分离式语音包**（用户决策）：桌宠安装包保持轻量，引擎包（嵌入式 Python + GPT-SoVITS 推理 + 基础模型，约 2~3GB）由委托人托管、应用内一键下载。音色双模式（用户决策）：委托人分发的预训练模型 + 用户参考音频零样本克隆。

GPT-SoVITS 事实标准接入方式为其官方 `api_v2.py` HTTP 服务（默认 9880 端口），提供 `/tts` 接口：参数含 `text`、`text_lang`、`ref_audio_path`、`prompt_text`、`prompt_lang`、`speed_factor` 等，返回 WAV 音频流。零样本克隆即通过 `ref_audio_path + prompt_text` 实现；预训练模型则通过启动参数（`-g` 权重 / `-s` 权重）加载。

## Goals / Non-Goals

**Goals:**
- 引擎包：一键下载 → 校验 → 解压 → 可启动，全程界面可见、可恢复
- 进程：懒启动（首次合成时拉起）、探活、端口顺延、有限重启、随应用退出
- 音色：预训练模型导入 + 参考音频克隆双模式，配置持久化
- 合成：本机引擎作为 TTS provider 之一接入现有播放/口型/打断链路
- 状态：引擎与音色状态全程可见，失败给明确原因与入口

**Non-Goals:**
- 不做训练流程与训练 UI（训练用官方工具线下完成，产物以文件分发）
- 不改变现有 OpenAI 兼容 TTS 路线（两者并存，用户选择）
- 不做非 Windows 引擎包；不做引擎包的自动更新（提供手动"重新下载"）
- 不内置模型分发服务器（下载地址由委托人配置）

## Decisions

### D1：引擎包契约 —— ZIP + engine.json 清单

引擎包为标准 ZIP，解压后必须包含 `engine.json`（声明版本号、Python 可执行路径、api_v2 启动参数模板、健康检查路径）。应用按清单启动，不硬编码引擎内部布局——引擎包升级（换 GPT-SoVITS 版本）不需要改桌宠代码。解压目标为 `app.getPath('userData')/voice-engine/`，与用户数据同生命周期。

### D2：进程监督 —— 懒启动 + 三态重启上限

主进程新增 EngineManager：状态机（absent → downloading → installed → starting → ready → error）；首次合成请求触发懒启动（`spawn(python, [api_v2.py, -p port, -g gpt, -s sovits, ...])`），每 500ms 探活 `/ping`（上限 90 秒，覆盖模型加载）；退出码非 0 或探活超时 → 重启（≤3 次）→ error 态。`app.quit` 前向子进程发送终止并等待退出（Windows 下用 taskkill /T 处理子进程树）。

### D3：TTS provider 扩展 —— 设置增加 ttsType

TTS 配置增加 `ttsType: 'openai' | 'gptsovits'`（默认 openai，向后兼容）。gptsovits 合成走主进程 EngineManager：就绪 → HTTP GET/POST 引擎 `/tts`（text=text_lang=zh、ref_audio_path=音色目录内绝对路径、prompt_text/prompt_lang 来自音色配置、speed_factor 可选）→ WAV 字节 → 与现有响应同构返回渲染端播放。未安装/启动中/错误分别返回带原因的明确错误。

### D4：音色目录与双模式

音色数据存 `userData/voice-models/<name>/`：`model/`（gpt.ckpt、sovits.pth，预训练模式）、`ref/`（参考音频 + 参考文字 meta.json，零样本模式）、`voice.json`（模式、名称、参数）。设置页音色区块：模式切换、模型导入（文件选择器 + 复制入库）、参考音频上传（文件选择 + 文字输入）、试听按钮（合成一句固定文本直接播放）。v1 单一当前音色，多音色切换列后续。

### D5：下载实现 —— Node 原生流式 + 简单断点

下载用 `net.fetch` 流式写盘 + 进度事件推送到设置页；v1 不做断点续传（重下即可），但做大小校验 + 可选 SHA-256（engine.json 外的 sidecar 或 URL 指向清单由委托人提供）。解压用 tar/zip 的 Node 侧实现：为避免引入重依赖，**引擎包改用引擎自身 runtime 可解的格式不可行**——采用纯 JS 的轻量 unzip（如 yauzl 级别依赖，一个、可控）。

### D6：引擎包制作规范（委托人侧）

`docs/voice-engine-spec.md` 定义引擎包内容契约（目录布局、engine.json 字段、启动参数约定）与制作方法（基于 GPT-SoVITS 官方整合包裁剪推理必需项）；委托人按规范打包含托管。桌宠侧只依赖契约。

## Risks / Trade-offs

- [引擎包下载体积大（2~3GB）] → 进度可见 + 失败重下 + 委托人托管稳定源；不做断点续传为 v1 取舍
- [首次模型加载 10~60 秒] → 懒启动 + "语音引擎启动中"状态文案；可在设置中"预启动"提前热身
- [CPU 推理慢（5~15 秒/句）] → 设置页提示硬件预期；异步体验（文字先出、语音后到）；后续可选流式分句合成
- [api_v2 参数兼容性随 GPT-SoVITS 版本漂移] → engine.json 声明引擎版本，桌宠按契约调用；契约变更由新引擎包 + 新版本适配
- [子进程孤儿] → 退出时 taskkill /T；崩溃重启上限 3 次防雪崩
- [解压引入第三方 zip 依赖] → 选维护良好的纯 JS 库，锁定版本

## Migration Plan

纯新增功能，向后兼容：现有 OpenAI 兼容 TTS 用户不受影响（ttsType 默认 openai）。发布顺序：桌宠新版本（含引擎管理 UI，未下载引擎时功能置灰）→ 委托人发布引擎包与音色模型 → 用户一键下载启用。回滚：切回 openai TTS 类型即可，引擎目录可手动删除。

## Open Questions

- 引擎包的具体下载地址与托管方式（委托人网盘/自建，均通过设置页 URL 配置，不阻塞开发）
- 引擎包内 Python/PyTorch 的 CUDA 与 CPU 版本策略（可先出 CPU 版，CUDA 版后续按需；由引擎包制作者决定，桌宠按契约兼容）
