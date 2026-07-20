// In-process registry of live agent runs so the API layer can abort them.
// One entry per taskId; released when the run settles.

const running = new Map<string, AbortController>();

export function registerAgentRun(taskId: string): AbortController {
  const controller = new AbortController();
  running.set(taskId, controller);
  return controller;
}

export function releaseAgentRun(taskId: string) {
  running.delete(taskId);
}

export function abortAgentRun(taskId: string): boolean {
  const controller = running.get(taskId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function isAgentRunActive(taskId: string): boolean {
  return running.has(taskId);
}

export function listActiveAgentRuns(): string[] {
  return Array.from(running.keys());
}
