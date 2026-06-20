import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { ArrowLeft, Clock, DollarSign, Target, Wrench, Brain, BookOpen } from 'lucide-react';
import { getConversationMessages } from '@/api/client';
import type { Message, AgentTrace } from '@/api/types';

export function ConversationDetail() {
    const { id } = useParams<{ id: string }>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [trace, setTrace]     = useState<AgentTrace | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab]         = useState<'messages' | 'trace' | 'thinking'>('messages');

    useEffect(() => {
        if (!id) return;
        getConversationMessages(id).then(data => {
            setMessages(data.messages); setTrace(data.trace);
        }).finally(() => setLoading(false));
    }, [id]);

    if (loading) return <div className="text-muted text-sm py-12 text-center">Loading…</div>;

    return (
        <div className="max-w-3xl">
            <Link to="/conversations" className="flex items-center gap-1.5 text-muted hover:text-white text-sm mb-5 w-fit transition-colors">
                <ArrowLeft size={14} /> Back to conversations
            </Link>

            {/* Trace summary strip */}
            {trace && (
                <div className="flex flex-wrap gap-4 bg-surface border border-border rounded-xl px-5 py-3 mb-5 text-sm">
                    <div className="flex items-center gap-1.5 text-muted">
                        <Target size={13} className="text-green" />
                        <span>Confidence: <span className="text-white font-mono">{(trace.confidence * 100).toFixed(0)}%</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted">
                        <DollarSign size={13} className="text-yellow" />
                        <span>Cost: <span className="text-white font-mono">${(trace.costUsdCents / 100).toFixed(4)}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted">
                        <Clock size={13} className="text-blue" />
                        <span>Duration: <span className="text-white font-mono">{(trace.durationMs / 1000).toFixed(1)}s</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted">
                        <Wrench size={13} className="text-accent" />
                        <span>Tools: <span className="text-white font-mono">{trace.toolCalls.length}</span></span>
                    </div>
                    <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded ${
                        trace.outcome === 'resolved' ? 'bg-green/10 text-green' :
                            trace.outcome === 'pending_approval' ? 'bg-yellow/10 text-yellow' : 'bg-red/10 text-red'
                    }`}>{trace.outcome}</span>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-border">
                {([['messages', 'Messages'], ['trace', 'Tool Trace'], ['thinking', 'Thinking']] as const).map(([t, label]) => (
                    <button key={t} onClick={() => setTab(t)}
                            disabled={t === 'thinking' && (!trace?.thinkingBlocks?.length)}
                            className={`text-sm px-4 py-2 border-b-2 transition-colors ${
                                tab === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-white'
                            } disabled:opacity-30 disabled:cursor-not-allowed`}>{label}</button>
                ))}
            </div>

            {/* Messages tab */}
            {tab === 'messages' && (
                <div className="flex flex-col gap-3">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                msg.role === 'user' ? 'bg-accent text-white rounded-br-md' : 'bg-surface border border-border text-white rounded-bl-md'
                            }`}>
                                <div className="text-[10px] font-mono text-muted mb-1">{msg.role} · {new Date(msg.createdAt).toLocaleTimeString()}</div>
                                <p className="whitespace-pre-wrap">{msg.content.slice(0, 1000)}{msg.content.length > 1000 ? '…' : ''}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tool trace tab */}
            {tab === 'trace' && trace && (
                <div className="flex flex-col gap-3">
                    {trace.toolCalls.length === 0 && <p className="text-muted text-sm">No tool calls recorded.</p>}
                    {trace.toolCalls.map((tc, i) => (
                        <div key={i} className="bg-surface border border-border rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Wrench size={13} className="text-accent" />
                                    <span className="font-mono text-sm text-accent">{tc.tool}</span>
                                </div>
                                <span className="font-mono text-[10px] text-muted">{tc.durationMs}ms</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <div className="text-dim text-[10px] font-mono uppercase mb-1">Input</div>
                                    <pre className="bg-code text-muted text-[10px] rounded p-2 overflow-x-auto max-h-32">{JSON.stringify(tc.input, null, 2)}</pre>
                                </div>
                                <div>
                                    <div className="text-dim text-[10px] font-mono uppercase mb-1">Output</div>
                                    <pre className="bg-code text-muted text-[10px] rounded p-2 overflow-x-auto max-h-32">{tc.error ? `ERROR: ${tc.error}` : JSON.stringify(tc.output, null, 2)}</pre>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* RAG chunks */}
                    {trace.ragChunks.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <BookOpen size={13} className="text-blue" />
                                <span className="text-muted text-xs font-mono">RAG CONTEXT ({trace.ragChunks.length} chunks)</span>
                            </div>
                            {trace.ragChunks.map((chunk, i) => (
                                <div key={i} className="bg-surface border border-blue/20 rounded-lg p-3 mb-2">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-blue text-[10px] font-mono">{chunk.filename}</span>
                                        <span className="text-dim text-[10px] font-mono">score: {chunk.score.toFixed(3)}</span>
                                    </div>
                                    <p className="text-muted text-xs leading-relaxed">{chunk.content.slice(0, 300)}{chunk.content.length > 300 ? '…' : ''}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Thinking tab */}
            {tab === 'thinking' && trace && (
                <div className="bg-surface border border-accent/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Brain size={14} className="text-accent" />
                        <span className="text-accent text-xs font-mono">EXTENDED THINKING ({trace.thinkingBlocks.length} blocks)</span>
                    </div>
                    {trace.thinkingBlocks.map((b, i) => (
                        <div key={i} className="text-muted text-sm leading-relaxed mb-4 whitespace-pre-wrap border-l-2 border-accent/20 pl-3">
                            {b.thinking}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
