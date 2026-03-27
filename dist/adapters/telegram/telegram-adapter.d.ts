export declare class TelegramAdapter {
    private readonly botToken?;
    constructor(botToken?: string | undefined);
    sendMessage(params: {
        chatId: string;
        text: string;
        parseMode?: "Markdown" | "HTML";
    }): Promise<unknown>;
}
