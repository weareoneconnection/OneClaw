export type IdempotencyRecord = {
  key: string;
  taskId: string;
  createdAt: string;
};

export class IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  get(key: string) {
    return this.records.get(key);
  }

  set(key: string, taskId: string) {
    const record = { key, taskId, createdAt: new Date().toISOString() };
    this.records.set(key, record);
    return record;
  }
}
