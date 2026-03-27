export class OneClawClient {
  constructor(private readonly baseUrl: string) {}

  async runTask(input: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/v1/tasks/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return response.json();
  }

  async executeAction(input: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/v1/actions/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return response.json();
  }

  async getTask(id: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/v1/tasks/${id}`);
    return response.json();
  }
}
