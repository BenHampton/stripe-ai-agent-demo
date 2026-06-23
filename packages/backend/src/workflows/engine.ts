import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
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

    // Saga logging: a multi-step workflow with compensation is the hardest thing to
    // debug after the fact. Log each step boundary and every compensation so a partial
    // failure (step 3 of 5 failed, did the rollback work?) is fully reconstructable.
    const log = logger.child({ conversationId, workflowId: workflow.id, type: def.type });
    log.info({ type: def.type, stepCount: def.steps.length }, 'workflow started');


    let ctx = { ...initialCtx };
    const completedSteps: { index: number; compensate?: (ctx: TCtx) => Promise<void> }[] = [];

    try {
        for (let i = 0; i < def.steps.length; i++) {
            const step = def.steps[i]!;
            log.info({ step: step.name, index: i }, 'workflow step started');

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
            log.info({ step: step.name, index: i }, 'workflow step completed');
            completedSteps.push({ index: i, ...(step.compensate ? { compensate: step.compensate } : {}) });

            await db.update(workflows).set({
                steps: workflow.steps.map((s, idx) =>
                    idx === i ? { ...s, status: 'completed', result, completedAt: new Date().toISOString() } : s
                ) as WorkflowStep[],
                output: ctx,
            }).where(eq(workflows.id, workflow.id));
        }

        // All steps succeeded
        log.info('workflow completed');
        await db.update(workflows)
            .set({
                status:'completed',
                completedAt: new Date(),
            })
            .where(eq(workflows.id, workflow.id));

        return ctx;

    } catch (err) {
        // A step failed — compensate completed steps in reverse order
        log.error(
            { err: err instanceof Error ? err.message : String(err), completedSteps: completedSteps.length },
            'workflow step failed — compensating',
        )

        await db.update(workflows).set({ status: 'compensating' }).where(eq(workflows.id, workflow.id));

        for (const { index, compensate } of [...completedSteps].reverse()) {
            if (compensate) {
                try {
                    await compensate(ctx);
                } catch (compErr) {
                    // Log but continue compensating other steps
                    log.error(
                        { step: index, err: compErr instanceof Error ? compErr.message : String(compErr) },
                        'compensation failed - manual repair may be needed'
                    )
                }
            }
        }

        await db.update(workflows).set({
            status: 'compensated',
            error:  err instanceof Error ? err.message : 'Unknown error',
        }).where(eq(workflows.id, workflow.id));

        log.warn('workflow compensated (rolled back)');
        throw err; // re-throw so the caller knows the workflow failed
    }
}
