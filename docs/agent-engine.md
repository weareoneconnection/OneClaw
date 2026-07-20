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

## 安全边界

- 所有文件操作路径强制限制在 workspace 内(`../` 与 symlink 逃逸均拒绝)。
- bash 子进程环境变量过滤掉 `TOKEN|SECRET|PASSWORD|API_KEY|DATABASE_URL|AUTH|COOKIE|CREDENTIAL` —— 模型 echo 不出引擎自己的 key。
- 运行前 git 快照(detached commit),不污染分支历史。
- `status !== "completed"`(max_turns / budget_exceeded / error)时 worker 返回 `ok: false`,TheOne 侧不会当成功记账。
