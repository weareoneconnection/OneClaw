import { z } from "zod";

const jsonValue: z.ZodTypeAny = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]),
);

export const taskDefinitionSchema = z.object({
  taskName: z.string().min(1),
  approvalMode: z.enum(["auto", "manual"]).optional(),
  metadata: z.record(jsonValue).optional(),
  steps: z.array(
    z.object({
      id: z.string().min(1),
      action: z.string().min(1),
      input: z.record(jsonValue).optional(),
      dependsOn: z.array(z.string()).optional(),
      timeoutMs: z.number().int().positive().optional(),
      metadata: z.record(jsonValue).optional(),
    }),
  ).min(1),
});

export const actionExecutionSchema = z.object({
  action: z.string().min(1),
  input: z.record(jsonValue).optional(),
  approvalMode: z.enum(["auto", "manual"]).optional(),
});

export const approvalDecisionSchema = z.object({
  decidedBy: z.string().optional(),
  decisionNote: z.string().optional(),
});

export const taskListSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});
