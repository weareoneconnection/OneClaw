export type OneClawAction = "api.request" | "browser.open" | "browser.screenshot" | "file.read" | "file.write" | "message.send" | "social.post";
export type OneClawTaskRequest = {
    taskName: string;
    approvalMode?: "auto" | "manual";
    steps: Array<{
        id: string;
        action: OneClawAction;
        input: Record<string, unknown>;
        dependsOn?: string[];
    }>;
};
export declare function executeOneClawTask(task: OneClawTaskRequest): Promise<unknown>;
export declare function executeOneClawAction(payload: {
    action: OneClawAction;
    approvalMode?: "auto" | "manual";
    input: Record<string, unknown>;
}): Promise<unknown>;
