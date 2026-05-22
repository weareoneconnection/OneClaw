export class WorkerRegistry {
    items = new Map();
    register(worker) {
        this.items.set(worker.name, worker);
    }
    get(name) {
        return this.items.get(name);
    }
    list() {
        return [...this.items.values()];
    }
}
