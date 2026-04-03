import { z } from "zod";
export declare const taskDefinitionSchema: z.ZodObject<{
    taskName: z.ZodString;
    approvalMode: z.ZodOptional<z.ZodEnum<["auto", "manual"]>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodTypeAny>>;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodTypeAny>>;
        dependsOn: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timeoutMs: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodTypeAny>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        action: string;
        metadata?: Record<string, any> | undefined;
        timeoutMs?: number | undefined;
        input?: Record<string, any> | undefined;
        dependsOn?: string[] | undefined;
    }, {
        id: string;
        action: string;
        metadata?: Record<string, any> | undefined;
        timeoutMs?: number | undefined;
        input?: Record<string, any> | undefined;
        dependsOn?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    steps: {
        id: string;
        action: string;
        metadata?: Record<string, any> | undefined;
        timeoutMs?: number | undefined;
        input?: Record<string, any> | undefined;
        dependsOn?: string[] | undefined;
    }[];
    taskName: string;
    approvalMode?: "auto" | "manual" | undefined;
    metadata?: Record<string, any> | undefined;
}, {
    steps: {
        id: string;
        action: string;
        metadata?: Record<string, any> | undefined;
        timeoutMs?: number | undefined;
        input?: Record<string, any> | undefined;
        dependsOn?: string[] | undefined;
    }[];
    taskName: string;
    approvalMode?: "auto" | "manual" | undefined;
    metadata?: Record<string, any> | undefined;
}>;
export declare const actionExecutionSchema: z.ZodObject<{
    action: z.ZodString;
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodTypeAny>>;
    approvalMode: z.ZodOptional<z.ZodEnum<["auto", "manual"]>>;
}, "strip", z.ZodTypeAny, {
    action: string;
    approvalMode?: "auto" | "manual" | undefined;
    input?: Record<string, any> | undefined;
}, {
    action: string;
    approvalMode?: "auto" | "manual" | undefined;
    input?: Record<string, any> | undefined;
}>;
export declare const approvalDecisionSchema: z.ZodObject<{
    decidedBy: z.ZodOptional<z.ZodString>;
    decisionNote: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    decidedBy?: string | undefined;
    decisionNote?: string | undefined;
}, {
    decidedBy?: string | undefined;
    decisionNote?: string | undefined;
}>;
export declare const taskListSchema: z.ZodObject<{
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit?: number | undefined;
}, {
    limit?: number | undefined;
}>;
