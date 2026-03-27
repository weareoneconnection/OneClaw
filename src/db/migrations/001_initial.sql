create table if not exists oneclaw_tasks (
  id text primary key,
  task_name text not null,
  status text not null,
  approval_mode text not null,
  task_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_oneclaw_tasks_updated_at on oneclaw_tasks (updated_at desc);
create index if not exists idx_oneclaw_tasks_status on oneclaw_tasks (status);

create table if not exists oneclaw_approvals (
  id text primary key,
  task_id text not null,
  step_id text not null,
  action text not null,
  status text not null,
  reason text not null,
  input_json jsonb not null,
  approval_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz null,
  decided_by text null,
  decision_note text null
);

create index if not exists idx_oneclaw_approvals_status on oneclaw_approvals (status);
create index if not exists idx_oneclaw_approvals_task_step on oneclaw_approvals (task_id, step_id);
