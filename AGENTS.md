# AGENTS.md — 项目开发指南

## 项目概况

- 项目：**timezone_desktop**（远程仓库：https://github.com/Illidan429/timezone_desktop ，默认分支 `main`）
- 参考项目：`reference/midori-companion-avatar-main/`（Midori Companion Avatar，本地网页端 AI 伴侣头像：视线跟随、眨眼、口型同步、立绘切换；Python 本地服务 + 浏览器渲染）
  - 重点参考文件：`app.js`、`AGENT_INTEGRATION.md`、`CLAUDE.md`
  - ⚠️ 参考目录及其 zip 已在 `.gitignore` 中排除：**只查阅思路，不提交、不整包引用**；其素材（立绘、语音等）有独立版权（见其 `ASSET_RIGHTS.md`），**严禁直接拷贝进本项目**

## 开发流程：强制使用 OpenSpec（用户不会主动唤起）

本项目用 OpenSpec（v1.13+，spec-driven 模式）管理开发。**用户不会主动输入 `/opsx:*` 命令**——当用户用自然语言提出功能需求或改动时，Agent 必须自己主动调用对应工作流，不要直接写代码：

| 场景 | Agent 应做 |
|------|-----------|
| 用户提出新功能 / 需求变更 | 调用 `openspec-propose` 技能，生成提案（proposal.md、specs delta、design.md、tasks.md，中文） |
| 提案展示后用户表示同意（"可以"/"开始做"/"就这么办"等即视为确认） | 调用 `openspec-apply-change` 技能开始实施 |
| 变更实施完成、验证通过 | 调用 `openspec-archive-change` 技能归档 |
| 用户纯提问、讨论、探索想法（未要求改动） | 不进工作流，正常回答；探索性调研可用 `openspec-explore` |
| 已有进行中的变更需要调整 | 用 `openspec-update-change` |

约束：

- 提案属于**规划边界**：propose 阶段不改代码；提案展示后停下来等用户确认，用户确认即视为 apply 的授权，无需用户再敲命令。
- 所有 OpenSpec 产物（proposal、spec、design、tasks）一律用**简体中文**；代码标识符、路径、命令保持英文。该规则已写入 `openspec/config.yaml` 的 context。
- 规格目录放在 `openspec/specs/<capability>/`，按能力域组织，路径保持稳定。
- 底层命令等价物：`openspec list` / `openspec show <change>` / `openspec archive <change>` 等（`openspec --help` 查看全部）。

## 其他约定

- 参考代码只读；为本项目新写的代码放在项目自身结构中，不要混入 `reference/`。
- Git：主分支 `main`，远程 `origin`；提交信息用简体中文、一行概述即可。
