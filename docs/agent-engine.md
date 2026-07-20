# Agent Engine(自研编码智能体)

`code.patch.apply` 现在有两种执行模式:

| 模式 | 触发条件 | 行为 |
| --- | --- | --- |
| 直写模式(旧) | `input.files[]` 提供了完整文件内容 | 原子写入 + rollback bundle |
| **Agent 模式(新)** | `input.objective` 且无 `files[]` | 自研智能体循环:探索 → 编辑 → 用项目自己的测试验证 → 出 receipt |

引擎代码在 `src/workers/code/agent-engine/`(与 theone-complete 的 `src/lib/theone/agent-engine/` 保持同步,后者是 Vercel 侧的参考副本)。

## 架构位置

```
OneAI(规划,OpenAI 栈)
   ↓ theone.workflow_task.v1
TheOne(控制平面:code.patch.apply = high,整任务一次审批)
   ↓ local_bridge / Railway
OneClaw CodeWorker.runAgentObjective()
   ↓ 直连 Anthropic Messages API(key 只在本容器)
workspace(git 快照 → 循环 → diff receipt)
```

- 内部循环的几十次 bash/edit **不**逐条回 TheOne 审批;审批粒度是整个 run。
- 兜底:git 快照 commit 作为 `rollbackToken` 返回,`code.patch.rollback` 识别 7–40 位 hex 即走 `git checkout <snapshot> -- .`。

## 环境变量(只配在 Railway 容器 / 本地机)

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | 是 | 不配置 = 引擎关闭(明确报错,不假装工作)。**不要**配到 Vercel/OneAI |
| `ONECLAW_CODE_WORKSPACE_ALLOWLIST` | 是 | 逗号分隔的绝对路径;objective 的 workspacePath 必须在其内 |
| `AGENT_ENGINE_MODEL` | 否 | 默认 `claude-sonnet-5` |
| `AGENT_ENGINE_MAX_TURNS` | 否 | 默认 50 |
| `AGENT_ENGINE_MAX_TOOL_CALLS` | 否 | 默认 200 |

Dockerfile 已含 `git`(快照/回滚/diff 依赖它;缺失时引擎会降级为无快照运行并在 receipt 里标注)。

## 点火(第一次真实运行)

1. Railway 服务上配 `ANTHROPIC_API_KEY` 和 `ONECLAW_CODE_WORKSPACE_ALLOWLIST=/app/workspaces`(或本地跑:`.env` 里配本地仓路径)。
2. 发一个任务:

```bash
curl -X POST http://localhost:4100/v1/actions/execute \
  -H 'content-type: application/json' \
  -d '{
    "action": "code.patch.apply",
    "input": {
      "workspacePath": "/path/to/allowed/repo",
      "objective": "给 src/utils/foo.ts 的 parseAmount 函数补一个处理负数输入的单元测试,并确保 npm test 通过"
    }
  }'
```

(`code.patch.apply` 默认需要审批;拿到任务 id 后在 Admin UI `http://localhost:4100/admin` 里批准,或提交时带 `"approvalMode": "auto"` 做本地首跑。)

3. 输出里看 `output.receipt`(`theone.agent_receipt.v1`):

```jsonc
{
  "status": "completed",
  "diffStat": "...",            // git diff --stat 对比快照
  "diff": "...",                // 完整 diff(200k 字符截断)
  "commands": ["npm test", …],  // 引擎实际跑过的验证命令
  "usage": { "inputTokens": 0, "outputTokens": 0, "llmCalls": 0 },  // 计费依据,回传 TheOne 记账
  "snapshotCommit": "abc123…"   // 回滚令牌
}
```

4. 不满意就回滚:`code.patch.rollback` + `rollbackToken: <snapshotCommit>`。

## 运行时能力(Phase 4.5 第二批)

- **Prompt caching**:tools/system/对话尾部三个 `cache_control` 断点,循环里的历史前缀按缓存价计费(约 1/10),usage 里的 `cacheReadInputTokens` 可见命中量。
- **实时进度**:引擎每个事件写任务日志(`[agent:tool_call] …`),聊天页/Admin UI 轮询 `GET /v1/tasks/:id` 即可看到滚动过程;`GET /v1/agent-runs` 列出所有活跃 run。
- **中断**:`POST /v1/tasks/:id/agent/abort` 立即停止循环,run 以 `aborted` 结束;已做的修改保留,可用 snapshotCommit 回滚。
- **验证门禁(软)**:completed 但整个 run 没跑过任何 test/lint/build/typecheck 命令时,receipt 标 `verified: false`,任务状态为 `agent_run_completed_unverified`。
- **会话连续性**:每次 run 结束把摘要写进 workspace 的 `.oneclaw/agent-session.json`(24h 有效);下一次 run 自动注入 system prompt,跳过冷启动探索。传 `input.freshSession: true` 可强制冷启动。

## 基准测试

```bash
npm run bench:agent -- path/to/tasks.json
```

任务文件是 JSON 数组:`{name, workspace(fixture 仓路径), objective, verify(判分命令,exit 0 = 通过), maxTurns?}`。每题复制 fixture 到临时目录跑引擎,再用 `verify` 判分,输出通过率 + token 总量的 JSON 报告。引擎每次改动后重跑同一套题,看分数变化。

## 安全边界

- 所有文件操作路径强制限制在 workspace 内(`../` 与 symlink 逃逸均拒绝)。
- bash 子进程环境变量过滤掉 `TOKEN|SECRET|PASSWORD|API_KEY|DATABASE_URL|AUTH|COOKIE|CREDENTIAL` —— 模型 echo 不出引擎自己的 key。
- 运行前 git 快照(detached commit),不污染分支历史。
- `status !== "completed"`(max_turns / budget_exceeded / error)时 worker 返回 `ok: false`,TheOne 侧不会当成功记账。
