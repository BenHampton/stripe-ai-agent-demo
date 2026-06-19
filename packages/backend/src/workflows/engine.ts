import { eq } from 'drizzle-orm';
import { env, getDb, workflows } from '@sai/shared';
import type { WorkflowStep } from '@sai/shared';

export interface WorkflowStepDef<TCtx> {
    name:        string;
    execute:     (ctx: TCtx) => Promise<Partial<TCtx>>;
    compensate?: (ctx: TCtx) => Promise<void>; //rolls it back if a later step fails
}

export interface WorkflowDef<TCtx> {
    type:  string;
    steps: WorkflowStepDef<TCtx>[];
}

/**
 * Run a durable workflow.
 * Steps execute in order. If any step throws, completed steps are compensated
 * in reverse order. State is persisted to the workflows table after each step
 * so failures can be diagnosed and the workflow can be resumed manually.
 *
 * @param def            - Workflow definition (steps + type name)
 * @param initialCtx     - Initial context passed to the first step
 * @param conversationId - Links the workflow to its originating conversation
 */

export async function runWorkflow<TCtx extends Record<string, unknown>>(
    def: WorkflowDef<TCtx>,
    initialCtx: TCtx,
    conversationId: string,
): Promise<TCtx> {

    const db = getDb(env.DATABASE_URL)
    const [workflow] = await db.insert(workflows)
        .values({
            conversationId,
            type:        def.type,
            status:      'running',
            steps:       def.steps.map(s => ({ name: s.name, status: 'pending' })) as WorkflowStep[],
            currentStep: 0,
            input:       initialCtx,
        })
        .returning()

    if (!workflow) {
        throw new Error('Failed to create workflow record');
    }

    let ctx = { ...initialCtx };
    const completedSteps: { index: number; compensate?: (ctx: TCtx) => Promise<void> }[] = [];

    try {
        for (let i = 0; i < def.steps.length; i++) {
            const step = def.steps[i]!;

            // Mark step as running
            await db.update(workflows).set({
                currentStep: i,
                steps: workflow.steps.map((s, idx) =>
                    idx === i ? { ...s, status: 'running', startedAt: new Date().toISOString() } : s
                ) as WorkflowStep[],
            }).where(eq(workflows.id, workflow.id));

            // Execute step — merges returned partial context into ctx
            const result = await step.execute(ctx);
            ctx = { ...ctx, ...result };

            // Mark step as completed and record it for potential compensation
            completedSteps.push({ index: i, ...(step.compensate ? { compensate: step.compensate } : {}) });
            await db.update(workflows).set({
                steps: workflow.steps.map((s, idx) =>
                    idx === i ? { ...s, status: 'completed', result, completedAt: new Date().toISOString() } : s
                ) as WorkflowStep[],
                output: ctx,
            }).where(eq(workflows.id, workflow.id));
        }

        // All steps succeeded
        await db.update(workflows).set({
            status:      'completed',
            completedAt: new Date(),
        }).where(eq(workflows.id, workflow.id));

        return ctx;

    } catch (err) {
        // A step failed — compensate completed steps in reverse order
        await db.update(workflows).set({ status: 'compensating' }).where(eq(workflows.id, workflow.id));

        for (const { index, compensate } of [...completedSteps].reverse()) {
            if (compensate) {
                try {
                    await compensate(ctx);
                } catch (compErr) {
                    // Log but continue compensating other steps
                    console.error(`Compensation failed for step ${index}:`, compErr);
                }
            }
        }

        await db.update(workflows).set({
            status: 'compensated',
            error:  err instanceof Error ? err.message : 'Unknown error',
        }).where(eq(workflows.id, workflow.id));

        throw err; // re-throw so the caller knows the workflow failed
    }
}
