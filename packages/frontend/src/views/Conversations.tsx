import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { Webhook, MessageSquare, Bot, ChevronRight, RefreshCw } from 'lucide-react';
import { listConversations } from '@/api/client';
import type { Conversation } from '@/api/types';
import { StatusChip } from '@/components/StatusChip';

const CHANNEL_ICON = {
    chat:      MessageSquare,
    webhook:   Webhook,
    proactive: Bot,
};

const AGENT_COLOR: Record<string, string> = {
    billing:   'text-blue',
    knowledge: 'text-accent',
    retention: 'text-yellow',
    general:   'text-muted',
};

export function Conversations() {
    const [convos, setConvos] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');

    const load = useCallback(async () => {
        try {
            const data = await listConversations({ limit: 50 });
            setConvos(data.conversations);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = filter === 'all' ? convos : convos.filter(c => c.channel === filter || c.status === filter);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-lg font-semibold text-white">Conversations</h1>
                    <p className="text-muted text-xs">Chat, webhook, and proactive retention conversations</p>
                </div>
                <button onClick={load} className="text-muted hover:text-white transition-colors">
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-4 flex-wrap">
                {([['all', 'All'], ['chat', 'Chat'], ['webhook', 'Webhook'], ['proactive', 'Proactive'],
                    ['pending_approval', 'Needs Approval'], ['resolved', 'Resolved']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setFilter(val)}
                            className={`text-xs px-3 py-1 rounded-full border transition-colors font-mono ${
                                filter === val ? 'bg-accent/10 border-accent/30 text-accent' : 'border-border text-muted hover:text-white hover:border-border-light'
                            }`}>{label}</button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                    <tr className="border-b border-border text-muted text-xs font-mono">
                        <th className="text-left px-4 py-3">Customer / Channel</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Agent</th>
                        <th className="text-right px-4 py-3">Cost</th>
                        <th className="text-right px-4 py-3">Date</th>
                        <th className="px-4 py-3"></th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading && (
                        <tr><td colSpan={6} className="text-center text-muted py-12 text-sm">Loading…</td></tr>
                    )}
                    {!loading && filtered.length === 0 && (
                        <tr><td colSpan={6} className="text-center text-muted py-12 text-sm">No conversations yet. Send a chat message or trigger a webhook event.</td></tr>
                    )}
                    {filtered.map(c => {
                        const Icon = CHANNEL_ICON[c.channel] ?? MessageSquare;
                        return (
                            <tr key={c.id} className="border-b border-border/50 hover:bg-elevated/50 transition-colors group">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Icon size={13} className="text-muted flex-shrink-0" />
                                        <div>
                                            <div className="text-white text-xs font-mono truncate max-w-[140px]">{c.customerId}</div>
                                            <div className="text-dim text-[10px] capitalize">{c.channel}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3"><StatusChip status={c.status} /></td>
                                <td className="px-4 py-3">
                    <span className={`text-xs font-mono capitalize ${AGENT_COLOR[c.agentType ?? ''] ?? 'text-muted'}`}>
                      {c.agentType ?? '—'}
                    </span>
                                </td>
                                <td className="px-4 py-3 text-right text-muted font-mono text-xs">
                                    {c.costUsdCents ? `$${(c.costUsdCents / 100).toFixed(4)}` : '—'}
                                </td>
                                <td className="px-4 py-3 text-right text-dim font-mono text-[10px]">
                                    {new Date(c.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3">
                                    <Link to={`/conversations/${c.id}`} className="text-muted hover:text-accent transition-colors opacity-0 group-hover:opacity-100">
                                        <ChevronRight size={15} />
                                    </Link>
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}