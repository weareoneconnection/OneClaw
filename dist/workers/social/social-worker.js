export class SocialWorker {
    xAdapter;
    name = "social_worker";
    constructor(xAdapter) {
        this.xAdapter = xAdapter;
    }
    async execute(input, context) {
        await context.log(`SocialWorker executing ${context.action}`);
        const channel = String(input.channel ?? "x");
        if (channel === "x") {
            const mediaPaths = Array.isArray(input.mediaPaths)
                ? input.mediaPaths.map((item) => String(item))
                : undefined;
            const response = await this.xAdapter.createPost({
                text: String(input.content ?? ""),
                replyToTweetId: input.replyToTweetId ? String(input.replyToTweetId) : undefined,
                mediaPaths,
            });
            return {
                ok: true,
                output: {
                    published: true,
                    channel,
                    response: response,
                },
            };
        }
        return { ok: false, error: `Unsupported social channel: ${channel}` };
    }
}
