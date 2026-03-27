const statsEl = document.getElementById('stats');
const approvalsEl = document.getElementById('approvals');
const tasksEl = document.getElementById('tasks');
const tokenEl = document.getElementById('token');
const refreshEl = document.getElementById('refresh');

function headers() {
  const token = tokenEl.value.trim();
  return token ? { 'x-oneclaw-admin-token': token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function renderStats(stats) {
  const entries = [
    ['Queued', stats.queued], ['Running', stats.running], ['Success', stats.success], ['Failed', stats.failed],
    ['Awaiting approval', stats.awaitingApproval], ['Rejected', stats.rejected], ['Pending approvals', stats.approvalsPending],
  ];
  statsEl.innerHTML = entries.map(([label, value]) => `
    <div class="stat">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>`).join('');
}

function renderApprovals(items) {
  if (!items.length) { approvalsEl.innerHTML = '<div class="empty">No pending approvals.</div>'; return; }
  approvalsEl.innerHTML = items.map((item) => `
    <div class="card">
      <div class="row"><strong>${item.action}</strong><span class="badge">${item.status}</span></div>
      <div class="muted">task ${item.taskId} · step ${item.stepId}</div>
      <div class="muted">reason: ${item.reason}</div>
      <pre>${JSON.stringify(item.input, null, 2)}</pre>
      <div class="actions">
        <button data-approve="${item.id}">Approve</button>
        <button class="secondary" data-reject="${item.id}">Reject</button>
      </div>
    </div>`).join('');
}

function renderTasks(items) {
  if (!items.length) { tasksEl.innerHTML = '<div class="empty">No recent tasks.</div>'; return; }
  tasksEl.innerHTML = items.map((item) => `
    <div class="card">
      <div class="row"><strong>${item.taskName}</strong><span class="badge">${item.status}</span></div>
      <div class="muted">${item.id}</div>
      <div class="muted">updated ${new Date(item.updatedAt).toLocaleString()}</div>
      <div class="muted">steps ${item.steps.length} · approval ${item.approvalMode}</div>
    </div>`).join('');
}

async function load() {
  try {
    const overview = await api('/admin/api/overview');
    renderStats(overview.stats);
    renderApprovals(overview.approvals);
    renderTasks(overview.tasks);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    approvalsEl.innerHTML = `<div class="empty">${msg}</div>`;
    tasksEl.innerHTML = '';
    statsEl.innerHTML = '';
  }
}

async function decide(id, status) {
  const path = `/v1/approvals/${id}/${status}`;
  await api(path, { method: 'POST', body: JSON.stringify({ decidedBy: 'admin-console' }) });
  await load();
}

document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const approveId = target.getAttribute('data-approve');
  const rejectId = target.getAttribute('data-reject');
  if (approveId) await decide(approveId, 'approve');
  if (rejectId) await decide(rejectId, 'reject');
});

refreshEl.addEventListener('click', load);
load();
