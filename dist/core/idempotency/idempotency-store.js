export class IdempotencyStore {
    records = new Map();
    get(key) {
        return this.records.get(key);
    }
    set(key, taskId) {
        const record = { key, taskId, createdAt: new Date().toISOString() };
        this.records.set(key, record);
        return record;
    }
}
