export class OneClawClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async runTask(input) {
        const response = await fetch(`${this.baseUrl}/v1/tasks/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        return response.json();
    }
    async executeAction(input) {
        const response = await fetch(`${this.baseUrl}/v1/actions/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        return response.json();
    }
    async getTask(id) {
        const response = await fetch(`${this.baseUrl}/v1/tasks/${id}`);
        return response.json();
    }
}
