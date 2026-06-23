import type Anthropic from '@anthropic-ai/sdk';
import { triageMessage, shouldUseExtendedThinking, TriageResult } from './triage.js';
import { rulesTriage } from './rules-gate.js';
import { runBillingAgent }   from './specialists/billing.js';
import { runKnowledgeAgent } from './specialists/knowledge.js';
import { runRetentionAgent } from './specialists/retention.js';
import { runAgent }          from './core.js';
import { agentLogger }       from '../lib/logger.js';
import {systemPrompts} from './prompts.js';
import type { AgentEvent }  from './core.js';
import {env} from "@sai/shared";

export interface  OrchestratorParms {
    userMessage: string
    conversationId: string
    customerId: string
    history: Anthropic.MessageParam[]
}

// Pick the routing strategy from config. Returns the same TriageResult either way,
// plus a 'strategy' tag so traces show HOW the routing decision was made.
async function selectTriage(
    userMessage: string,
    history: Anthropic.MessageParam[],
): Promise<TriageResult & { strategy: 'llm' | 'rules' }> {
    if (env.TRIAGE_MODE === 'rules') {
        return { ...rulesTriage(userMessage), strategy: 'rules' };  // no API call
    }
    return { ...(await triageMessage(userMessage, history)), strategy: 'llm' };
}


export async function* orchestrate(params: OrchestratorParms): AsyncGenerator<AgentEvent | { type: 'triage', category: string, confidence: number}> {

    const log = agentLogger(params.conversationId, 'orchestrator');
    const triage = await selectTriage(params.userMessage, params.history);
    log.info(
        { strategy: triage.strategy, category: triage.category, confidence: triage.confidence, reason: triage.reason },
        'triage complete',
    );
    yield { type: 'triage', category: triage.category, confidence: triage.confidence };

    const messages: Anthropic.MessageParam[] = [...params.history, { role: 'user', content: params.userMessage }]
    const useExtendedThinking = shouldUseExtendedThinking(triage.category, params.userMessage)
    const base = {
        messages,
        conversationId: params.conversationId,
        customerId: params.customerId,
    }

    try {
        log.info({agent: triage.category, useExtendedThinking}, 'dispatching to specialist');

        switch (triage.category) {
            case 'billing':
                yield* runBillingAgent({...base, useExtendedThinking})
                break
            case 'retention':
                yield* runRetentionAgent({...base, useExtendedThinking})
                break
            case 'knowledge':
                yield* runKnowledgeAgent(base)
                break
            default:
                yield* runAgent({
                    agentType: 'general',
                    systemPrompt: systemPrompts.general,
                    ...base
                })
        }
    } catch (err) {
        // Log with the error before re-throwing so the failure is visible in stdout
        // even though the SSE stream will also surface it to the caller.
        log.error({ agent: triage.category, err: err instanceof Error ? err.message : String(err) }, 'orchestration failed');
        throw err;
    }
}