import { useState } from 'react';
import { Zap, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { SEED_CUSTOMERS } from '@/store/auth';

async function triggerEvent(event: string, body: object = {}) {
    const apiKey = localStorage.getItem('agent_api_key') ?? 'demo-admin-key';
    const res = await fetch(`/api/simulate/${event}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(body),
    });
    return res.json();
}

interface SimResult { status: 'idle' | 'loading' | 'success' | 'error'; message: string }

const SCENARIOS = [
    {
        id: 'payment_failed',
        title: 'Payment Failed',
        description: 'Fires payment_intent.payment_failed for Carol (who has a payment method issue). The agent autonomously assesses the dunning status and logs a recovery plan.',
        event: 'payment_failed',
        customer: 'Carol',
        color: 'red',
    },
    {
        id: 'subscription_cancelled',
        title: 'Subscription Cancelled',
        description: 'Fires customer.subscription.deleted for Bob (already set to cancel). The agent assesses the cancellation and evaluates win-back eligibility.',
        event: 'subscription_cancelled',
        customer: 'Bob',
        color: 'yellow',
    },
    {
        id: 'dispute_created',
        title: 'Dispute Filed',
        description: 'Fires charge.dispute.created for Dave. The agent escalates immediately — disputes are explicitly blocked from autonomous action by the guardrails.',
        event: 'dispute_created',
        customer: 'Dave',
        color: 'red',
    },
    {
        id: 'retention_scan',
        title: 'Proactive Retention Scan',
        description: 'Runs the proactive retention agent across all at-risk customers. Creates conversations for Bob (cancel_at_period_end) and Carol (payment_failed) with retention assessments.',
        event: 'retention_scan',
        customer: 'All',
        color: 'accent',
    },
];

export function Simulate() {
    const [results, setResults] = useState<Record<string, SimResult>>({});

    const trigger = async (scenario: typeof SCENARIOS[0]) => {
        setResults(prev => ({ ...prev, [scenario.id]: { status: 'loading', message: 'Triggering…' } }));

        const customer = SEED_CUSTOMERS.find(c => c.name === scenario.customer);
        const body = customer ? { customerId: customer.id } : {};

        try {
            const data = await triggerEvent(scenario.event, body);
            setResults(prev => ({
                ...prev,
                [scenario.id]: { status: 'success', message: data.error ?? `Triggered: ${data.triggered}` }
            }));
        } catch (err) {
            setResults(prev => ({ ...prev, [scenario.id]: { status: 'error', message: err instanceof Error ? err.message : 'Failed' } }));
        }
    };

    const COLOR_MAP: Record<string, string> = {
        red:    'border-red/20 bg-red/5',
        yellow: 'border-yellow/20 bg-yellow/5',
        accent: 'border-accent/20 bg-accent/5',
    };

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-lg font-semibold text-white">Simulate</h1>
                <p className="text-muted text-xs">Trigger Stripe test events to demo autonomous agent behavior · Test mode only</p>
            </div>

            <div className="callout info mb-6">
                <div className="text-blue text-xs font-bold uppercase tracking-wider mb-1.5">Before simulating</div>
                <p className="text-muted text-sm">
                    Make sure the Stripe CLI is forwarding webhooks:
                </p>
                <code className="block mt-2 bg-elevated text-green text-xs font-mono px-3 py-2 rounded">
                    stripe listen --forward-to localhost:3000/api/webhooks/stripe
                </code>
                <p className="text-muted text-xs mt-2">
                    Each button creates a real Stripe test event. After triggering, navigate to Conversations
                    to see the webhook-created conversation and the agent's autonomous response.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SCENARIOS.map(s => {
                    const result = results[s.id];
                    return (
                        <div key={s.id} className={`border rounded-xl p-5 ${COLOR_MAP[s.color] ?? 'border-border bg-surface'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <Zap size={14} className={`text-${s.color === 'accent' ? 'accent' : s.color}`} />
                                <span className="text-white font-medium text-sm">{s.title}</span>
                                <span className="text-dim text-xs font-mono ml-auto">{s.customer}</span>
                            </div>
                            <p className="text-muted text-xs leading-relaxed mb-4">{s.description}</p>
                            <button
                                onClick={() => trigger(s)}
                                disabled={result?.status === 'loading'}
                                className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg bg-elevated border border-border hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
                            >
                                {result?.status === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                Trigger
                            </button>
                            {result && result.status !== 'loading' && (
                                <div className={`mt-3 flex items-start gap-2 text-xs font-mono ${result.status === 'success' ? 'text-green' : 'text-red'}`}>
                                    {result.status === 'success' ? <CheckCircle size={12} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />}
                                    {result.message}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}