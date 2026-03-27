create index if not exists idx_oneclaw_tasks_task_name on oneclaw_tasks (task_name);
create index if not exists idx_oneclaw_approvals_created_at on oneclaw_approvals (created_at desc);
