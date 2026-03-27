export class MessagingWorker {
    telegram;
    name = "messaging_worker";
    constructor(telegram) {
        this.telegram = telegram;
    }
    async execute(input, context) {
        await context.log(`MessagingWorker executing ${context.action}`);
        const provider = String(input.provider ?? "telegram");
        if (provider === "telegram") {
            const response = await this.telegram.sendMessage({
                chatId: String(input.chatId ?? ""),
                text: String(input.text ?? ""),
                parseMode: input.parseMode === "HTML" ? "HTML" : input.parseMode === "Markdown" ? "Markdown" : undefined,
            });
            return { ok: true, output: { delivered: true, provider, response: response } };
        }
        return { ok: false, error: `Unsupported messaging provider: ${provider}` };
    }
}
