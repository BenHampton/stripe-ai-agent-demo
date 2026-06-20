import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import { listApprovals, reviewApproval } from '@/api/client';
import type { PendingApproval } from '@/api/types';

const ACTION_LABELS: Record<string, string> = {
    issue_refund:          'Issue Refund',
    cancel_subscription:   'Cancel Subscription (Immediate)',
    apply_discount:        'Apply Discount',
};

function timeUntilExpiry(expiresAt: string): string {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms < 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

export function Approvals() {
    const [approvals, setApprovals] = useState<PendingApproval[]>([]);
    const [loading, setLoading]   = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);
    const [message, setMessage]   = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try { const d = await listApprovals(); setApprovals(d.approvals); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const handleReview = async (id: string, decision: 'approved' | 'rejected') => {
        setProcessing(id);
        try {
            await reviewApproval(id, decision, 'demo-admin');
            setMessage(decision === 'approved' ? '✓ Action approved and executed in Stripe' : '✗ Action rejected');
            await load();
            setTimeout(() => setMessage(null), 4000);
        } catch (err) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        } finally {
            setProcessing(null);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-lg font-semibold text-white">Approval Queue</h1>
                    <p className="text-muted text-xs">Actions blocked by guardrails awaiting human review · 24h expiry</p>
                </div>
                <button onClick={load} className="text-muted hover:text-white transition-colors">
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {message && (
                <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-mono border ${
                    message.startsWith('✓') ? 'bg-green/10 border-green/20 text-green' : 'bg-red/10 border-red/20 text-red'
                }`}>{message}</div>
            )}

            {loading && <div className="text-muted text-sm py-12 text-center">Loading…</div>}

            {!loading && approvals.length === 0 && (
                <div className="text-center py-16 bg-surface border border-border rounded-xl">
                    <CheckCircle size={32} className="text-green mx-auto mb-3" />
                    <p className="text-white font-medium mb-1">No pending approvals</p>
                    <p className="text-muted text-sm">The queue is clear. Trigger a refund over $100 to see an approval entry.</p>
                </div>
            )}

            <div className="flex flex-col gap-4">
                {approvals.map(approval => (
                    <div key={approval.id} className="bg-surface border border-yellow/20 rounded-xl p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle size={14} className="text-yellow" />
                                    <span className="text-yellow font-medium text-sm">
                    {ACTION_LABELS[approval.action] ?? approval.action}
                  </span>
                                    <span className="text-dim font-mono text-[10px]">·</span>
                                    <span className="text-dim font-mono text-[10px] capitalize">{approval.agentType} agent</span>
                                </div>

                                {/* Action parameters */}
                                <div className="bg-elevated rounded-lg p-3 mb-3">
                                    <div className="text-dim text-[10px] font-mono uppercase mb-1.5">Proposed action</div>
                                    {approval.action === 'issue_refund' && (
                                        <div className="text-sm text-white font-mono">
                                            Refund ${(Number(approval.params.amount_cents) / 100).toFixed(2)} on charge {approval.params.charge_id as string}
                                        </div>
                                    )}
                                    {approval.action !== 'issue_refund' && (
                                        <pre className="text-muted text-[10px] overflow-x-auto">{JSON.stringify(approval.params, null, 2)}</pre>
                                    )}
                                </div>

                                {/* Agent reasoning */}
                                <div className="bg-elevated rounded-lg p-3 mb-3">
                                    <div className="text-dim text-[10px] font-mono uppercase mb-1.5">Agent reasoning</div>
                                    <p className="text-muted text-xs leading-relaxed">{approval.reasoning}</p>
                                </div>

                                <div className="flex items-center gap-2 text-dim text-[10px] font-mono">
                                    <Clock size={10} />
                                    {timeUntilExpiry(approval.expiresAt)}
                                    <span>·</span>
                                    Created {new Date(approval.createdAt).toLocaleString()}
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => handleReview(approval.id, 'approved')}
                                    disabled={processing === approval.id}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-green/10 border border-green/20 text-green rounded-lg text-sm font-medium hover:bg-green/20 transition-colors disabled:opacity-50"
                                >
                                    <CheckCircle size={14} /> Approve
                                </button>
                                <button
                                    onClick={() => handleReview(approval.id, 'rejected')}
                                    disabled={processing === approval.id}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-red/10 border border-red/20 text-red rounded-lg text-sm font-medium hover:bg-red/20 transition-colors disabled:opacity-50"
                                >
                                    <XCircle size={14} /> Reject
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}