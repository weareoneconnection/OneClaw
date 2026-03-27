export class Web3Worker {
    name = "web3_worker";
    async execute(input, context) {
        context.log(`Web3Worker executing ${context.action}`);
        return {
            ok: true,
            output: {
                chain: input.chain ?? "unknown",
                action: context.action,
                mocked: true,
            },
        };
    }
}
