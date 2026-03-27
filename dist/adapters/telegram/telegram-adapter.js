export class TelegramAdapter {
    botToken;
    constructor(botToken) {
        this.botToken = botToken;
    }
    async sendMessage(params) {
        if (!this.botToken)
            throw new Error("TELEGRAM_BOT_TOKEN is not configured");
        const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: params.chatId,
                text: params.text,
                parse_mode: params.parseMode,
            }),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
        }
        return response.json();
    }
}
