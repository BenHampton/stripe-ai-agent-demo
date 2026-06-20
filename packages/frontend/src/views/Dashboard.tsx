import { useState, useEffect, useCallback } from 'react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { getDashboardMetrics } from '@/api/client';
import type { DashboardMetrics } from '@/api/types';
import { RefreshCw } from 'lucide-react';

const CHART_COLORS = { accent: '#7c6af7', green: '#4ade80', yellow: '#fbbf24', red: '#f87171', blue: '#60a5fa' };
const TOOLTIP_STYLE = { backgroundColor: '#1a1d27', border: '1px solid #2e3348', borderRadius: '8px', color: '#e2e4f0', fontSize: 12 };

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-muted text-xs font-mono uppercase tracking-wider mb-1">{label}</div>
            <div className="text-2xl font-bold text-white">{value}</div>
            {sub && <div className="text-muted text-xs mt-0.5">{sub}</div>}
        </div>
    );
}

export function Dashboard() {
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    // useCallback so `load` is stable for both the mount effect and the
    // refresh button. No setLoading(true) here: `loading` already starts true,
    // and a synchronous setState inside the effect trips react-hooks'
    // set-state-in-effect rule. The setMetrics/setLoading below run after the
    // await, which is the legitimate "update from an external system" case.
    const load = useCallback(async () => {
        try { setMetrics(await getDashboardMetrics()); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="text-muted text-sm py-12 text-center">Loading metrics…</div>;
    if (!metrics) return null;

    const p = metrics.performance;
    const total = Number(p.total_runs);
    const outcomeData = [
        { name: 'Resolved',  value: p.resolved,         color: CHART_COLORS.green  },
        { name: 'Escalated', value: p.escalated,         color: CHART_COLORS.red    },
        { name: 'Queued',    value: p.pending_approval,  color: CHART_COLORS.yellow },
    ].filter(d => d.value > 0);

    const dailyData = metrics.dailyCosts.map(d => ({
        date:  d.date.slice(5),  // MM-DD
        cost:  parseFloat(d.cost_cents) / 100,
        runs:  parseInt(d.runs),
    }));

    const agentData = metrics.agentBreakdown.map(d => ({
        name:       d.agent_type,
        runs:       parseInt(d.runs),
        cost:       parseFloat(d.cost_cents) / 100,
        confidence: Math.round((d.avg_confidence ?? 0) * 100),
    }));

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-lg font-semibold text-white">Dashboard</h1>
                    <p className="text-muted text-xs">Last 7 days · {total} agent runs</p>
                </div>
                <button onClick={load} className="text-muted hover:text-white transition-colors">
                    <RefreshCw size={15} />
                </button>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard label="Total Runs"    value={total.toString()} />
                <StatCard label="Avg Confidence" value={`${Math.round((p.avg_confidence ?? 0) * 100)}%`} />
                <StatCard label="Avg Latency"   value={`${((p.avg_duration_ms ?? 0) / 1000).toFixed(1)}s`} sub="per agent run" />
                <StatCard label="Total Cost"    value={`$${(Number(p.total_cost_cents ?? 0) / 100).toFixed(4)}`} sub={`${metrics.pendingApprovals} pending approvals`} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Daily cost trend */}
                <div className="bg-surface border border-border rounded-xl p-4">
                    <div className="text-muted text-xs font-mono uppercase mb-3">Daily cost (USD)</div>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2e3348" />
                            <XAxis dataKey="date" tick={{ fill: '#7c82a0', fontSize: 10 }} />
                            <YAxis tick={{ fill: '#7c82a0', fontSize: 10 }} tickFormatter={v => `$${v.toFixed(3)}`} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`$${Number(v).toFixed(4)}`, 'Cost']} />
                            <Line type="monotone" dataKey="cost" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Outcome distribution */}
                <div className="bg-surface border border-border rounded-xl p-4">
                    <div className="text-muted text-xs font-mono uppercase mb-3">Outcome distribution</div>
                    {outcomeData.length === 0 ? (
                        <div className="text-muted text-sm text-center py-16">No data yet</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie data={outcomeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                                    {outcomeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                </Pie>
                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#7c82a0' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Agent type breakdown */}
            {agentData.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                    <div className="text-muted text-xs font-mono uppercase mb-3">Runs by agent type</div>
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={agentData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2e3348" />
                            <XAxis dataKey="name" tick={{ fill: '#7c82a0', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#7c82a0', fontSize: 10 }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="runs" fill={CHART_COLORS.accent} radius={[4,4,0,0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
