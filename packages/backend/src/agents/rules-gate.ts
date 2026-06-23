import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import type { TriageResult } from './triage.js';

// Zod schema — the safety net for externalized config. Every rule is validated at LOAD
// time: a bad category, an out-of-range confidence, or a pattern that isn't a compilable
// regex fails HERE (at boot) with a clear error, not silently at request time. This is
// what you trade type-safety FOR when rules leave TypeScript — so you claw it back here.
const RuleSchema = z.object({
    category: z.enum(['billing', 'knowledge', 'retention', 'general']),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    patterns: z.array(
        z.string().refine(
            (s) => { try { new RegExp(s); return true; } catch { return false; } },
            'invalid regular expression',
        ),
    ).min(1),
});
const RulesFileSchema = z.array(RuleSchema).min(1);

interface CompiledRule {
    category:   TriageResult['category'];
    confidence: number;
    reason:     string;
    patterns:   RegExp[];
}

// Load once at module init. The strings from YAML are compiled to RegExp here. If the
// file is malformed, RulesFileSchema.parse throws and the process fails to start — which
// is exactly what you want: a broken rules file should never reach production silently.
function loadRules(): CompiledRule[] {
    const path = new URL('./rules.yaml', import.meta.url);
    const validated = RulesFileSchema.parse(parse(readFileSync(path, 'utf8')));
    return validated.map((r) => ({ ...r, patterns: r.patterns.map((p) => new RegExp(p, 'i')) }));
}

const RULES = loadRules();
logger.info({ ruleCount: RULES.length }, 'routing rules loaded from yaml');

// Same contract as triageMessage (minus the async/LLM call) so the orchestrator can
// swap them freely. No network, no cost, fully deterministic and auditable.
export function rulesTriage(userMessage: string): TriageResult {
    for (const rule of RULES) {
        if (rule.patterns.some((p) => p.test(userMessage))) {
            return { category: rule.category, confidence: rule.confidence, reason: rule.reason };
        }
    }
    // Nothing matched — low confidence signals "this is a guess, not a classification."
    return { category: 'general', confidence: 0.3, reason: 'no rule matched — defaulted to general' };
}