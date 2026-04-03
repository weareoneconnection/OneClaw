function asString(value) {
    return String(value ?? "").trim();
}
function asOptionalString(value) {
    const text = String(value ?? "").trim();
    return text ? text : undefined;
}
function asPositiveNumber(value) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0)
        return num;
    return undefined;
}
function notImplemented(action, chain, extra) {
    return {
        ok: false,
        error: `Web3 action not implemented yet: ${action}`,
        output: {
            action,
            chain,
            mocked: false,
            implemented: false,
            ...(extra ?? {}),
        },
    };
}
export class Web3Worker {
    name = "web3_worker";
    async execute(input, context) {
        await context.log(`Web3Worker executing ${context.action}`);
        try {
            const action = asString(context.action);
            const chain = asString(input.chain || "unknown").toLowerCase();
            if (!action) {
                return {
                    ok: false,
                    error: "Missing web3 action",
                };
            }
            switch (action) {
                case "web3.ping": {
                    await context.log(`Web3Worker ping chain=${chain}`);
                    return {
                        ok: true,
                        output: {
                            action,
                            chain,
                            alive: true,
                            implemented: true,
                        },
                    };
                }
                case "web3.balance": {
                    const address = asOptionalString(input.address);
                    if (!address) {
                        return {
                            ok: false,
                            error: "web3.balance requires input.address",
                        };
                    }
                    await context.log(`Web3Worker balance requested chain=${chain} address=${address}`);
                    return notImplemented(action, chain, {
                        address,
                    });
                }
                case "web3.tx": {
                    const hash = asOptionalString(input.hash);
                    if (!hash) {
                        return {
                            ok: false,
                            error: "web3.tx requires input.hash",
                        };
                    }
                    await context.log(`Web3Worker tx requested chain=${chain} hash=${hash}`);
                    return notImplemented(action, chain, {
                        hash,
                    });
                }
                case "web3.contract.read": {
                    const address = asOptionalString(input.address);
                    const method = asOptionalString(input.method);
                    const abi = input.abi;
                    const args = input.args;
                    if (!address) {
                        return {
                            ok: false,
                            error: "web3.contract.read requires input.address",
                        };
                    }
                    if (!method) {
                        return {
                            ok: false,
                            error: "web3.contract.read requires input.method",
                        };
                    }
                    await context.log(`Web3Worker contract.read chain=${chain} address=${address} method=${method}`);
                    return notImplemented(action, chain, {
                        address,
                        method,
                        abi: abi ?? null,
                        args: args ?? null,
                    });
                }
                case "web3.contract.write": {
                    const address = asOptionalString(input.address);
                    const method = asOptionalString(input.method);
                    const abi = input.abi;
                    const args = input.args;
                    const value = input.value ?? null;
                    const from = asOptionalString(input.from);
                    const gas = asPositiveNumber(input.gas);
                    const gasPrice = input.gasPrice ?? null;
                    if (!address) {
                        return {
                            ok: false,
                            error: "web3.contract.write requires input.address",
                        };
                    }
                    if (!method) {
                        return {
                            ok: false,
                            error: "web3.contract.write requires input.method",
                        };
                    }
                    await context.log(`Web3Worker contract.write chain=${chain} address=${address} method=${method}`);
                    return notImplemented(action, chain, {
                        address,
                        method,
                        abi: abi ?? null,
                        args: args ?? null,
                        value,
                        from: from ?? null,
                        gas: gas ?? null,
                        gasPrice,
                    });
                }
                case "web3.transfer": {
                    const to = asOptionalString(input.to);
                    const amount = input.amount ?? null;
                    const token = asOptionalString(input.token);
                    const from = asOptionalString(input.from);
                    if (!to) {
                        return {
                            ok: false,
                            error: "web3.transfer requires input.to",
                        };
                    }
                    if (amount === null || amount === undefined || String(amount).trim() === "") {
                        return {
                            ok: false,
                            error: "web3.transfer requires input.amount",
                        };
                    }
                    await context.log(`Web3Worker transfer requested chain=${chain} to=${to}`);
                    return notImplemented(action, chain, {
                        to,
                        amount: amount,
                        token: token ?? null,
                        from: from ?? null,
                    });
                }
                default:
                    return {
                        ok: false,
                        error: `Unsupported web3 action: ${action}`,
                    };
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown web3 error";
            await context.log(`Web3Worker failed: ${message}`);
            return {
                ok: false,
                error: message,
            };
        }
    }
}
