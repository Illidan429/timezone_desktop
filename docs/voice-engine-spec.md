# GPT-SoVITS 语音引擎包制作规范

> 面向委托人/打包者。桌宠应用只依赖本规范定义的**契约**（engine.json + HTTP 接口），不硬编码引擎内部布局——按本规范打包的引擎包，应用即可一键下载、解压、启动、合成。

## 1. 交付物

| 交付物 | 形态 | 说明 |
|--------|------|------|
| 引擎包 | `voice-engine-<版本>-<cpu|cuda>.zip` | 嵌入式 Python 运行时 + GPT-SoVITS 推理必需项 + 基础模型，约 2~3GB |
| 校验文件 | `voice-engine-<版本>-<cpu|cuda>.zip.sha256` | 内容为 `<sha256十六进制>  <文件名>`（`sha256sum` 输出格式），可选但强烈建议 |
| 音色模型 | 由委托人另行分发（见 §6） | 训练好的 GPT/SoVITS 权重 + 默认参考音频 |

托管方式不限（网盘直链 / 自建 HTTP），最终以**直链 URL** 配置到桌宠设置页「语音引擎 → 下载地址」。

## 2. 引擎包目录布局

ZIP 解压后，`engine.json` 必须位于**压缩包根目录**或**唯一顶层目录**内。推荐布局（可按需调整，契约只看 engine.json）：

```
voice-engine/
├─ engine.json              # 契约清单（见 §3）
├─ api_v2.py                # GPT-SoVITS 官方 api_v2 服务入口
├─ GPT_SoVITS/              # 推理代码
├─ python/                  # 嵌入式 Python 运行时
│  └─ python.exe
├─ GPT_SoVITS/pretrained_models/   # 基础模型（s1bert、s2G488k、chinese-hubert-base、chinese-roberta-wwm-ext-large 等）
└─ tools/、i18n/ 等 api_v2 运行所必需项
```

制作方法：以 GPT-SoVITS 官方整合包（Runtime 適配版）为基础，裁掉训练/标注/WebUI 相关项，保留 `api_v2.py` 及其启动依赖；Python 用官方 embeddable package + pip 依赖离线装入。GPT-SoVITS 为 MIT 许可，分发时请保留其 LICENSE（应用侧已在 CREDITS 署名）。

## 3. engine.json 字段（必读契约）

```json
{
  "version": "1.0.0-cpu",
  "runtime": "python",
  "python": "python/python.exe",
  "api": "api_v2.py",
  "args": ["-p", "{port}", "-g", "{gpt}", "-s", "{sovits}"],
  "pingPath": "/ping",
  "ttsPath": "/tts"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `version` | ✅ | 版本号，设置页展示用 |
| `runtime` | ✅ | `python`（正式引擎）；`node` 仅供桩引擎/联调 |
| `python` | runtime=python 时 | 相对引擎根目录的 Python 可执行路径 |
| `api` | ✅ | 相对引擎根目录的服务入口脚本 |
| `args` | ❌（默认 `["-p","{port}"]`） | 启动参数模板，支持占位符：`{port}` 端口、`{gpt}` GPT 权重绝对路径、`{sovits}` SoVITS 权重绝对路径 |
| `pingPath` | ✅ | 就绪探活路径，返回 HTTP 200 即视为就绪 |
| `ttsPath` | ✅ | 合成接口路径（见 §4） |

## 4. HTTP 接口契约

- `GET {pingPath}` → 200 即就绪（应用每 500ms 探活，上限 90 秒——首次加载模型 10~60 秒属正常）。
- `GET {ttsPath}?text=...&text_lang=zh&ref_audio_path=...&prompt_text=...&prompt_lang=zh`
  → 200，body 为 **WAV 音频字节**；失败返回非 200。
  与 GPT-SoVITS 官方 `api_v2.py` 的 `/tts` 参数一致；`ref_audio_path` / `prompt_text` 由应用从当前启用音色的目录提供（见 §6）。

## 5. 打包与校验

```bash
# 1) 组装目录 voice-engine/（含 engine.json）
# 2) 压缩（根目录内容直接置于 ZIP 顶层，或置于唯一顶层目录内）
# 3) 生成校验文件
sha256sum voice-engine-1.0.0-cpu.zip > voice-engine-1.0.0-cpu.zip.sha256
```

Windows 下可用 `Compress-Archive`；应用下载后会做 Content-Length 比对 + SHA-256 校验，不一致将拒绝安装。

## 6. 音色模型交付物（固定目标音色）

每个音色一个目录，交付给用户后由用户在设置页一键导入：

```
<音色名>/
├─ model/
│  ├─ gpt.ckpt          # 训练好的 GPT 权重
│  └─ sovits.pth        # 训练好的 SoVITS 权重
└─ ref/
   ├─ default.wav       # 默认参考音频（3~10 秒，音色标准样本）
   └─ prompt.txt        # default.wav 对应的文字内容
```

应用启动引擎时以 `-g`/`-s`（engine.json 模板占位符）载入 `model/` 权重；合成时把 `ref/default.wav` 与 `prompt.txt` 内容作为 `ref_audio_path`/`prompt_text` 传入。**参考音频质量直接决定合成音色稳定性，请选干净、无背景音乐的样本。**
