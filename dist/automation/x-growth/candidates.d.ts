import { XAdapter } from "../../adapters/x/x-adapter.js";
import type { CandidateTweet } from "./types.js";
export declare function fetchGrowthCandidates(x: XAdapter): Promise<CandidateTweet[]>;
