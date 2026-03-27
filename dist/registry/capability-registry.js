export class CapabilityRegistry {
    items = new Map();
    register(registration) {
        this.items.set(registration.action, registration);
    }
    get(action) {
        return this.items.get(action);
    }
    list() {
        return [...this.items.values()];
    }
}
