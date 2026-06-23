import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Brain } from 'lucide-react';
import { useAuthStore} from '@/store/auth';
import { useChatStream } from '@/api/sse';
import { ToolBadge } from '@/components/ToolBadge';

const AGENT_COLORS: Record<string, string> = {
    billing:   'text-blue bg-blue/10',
    knowledge: 'text-accent bg-accent/10',
    retention: 'text-yellow bg-yellow/10',
    general:   'text-muted bg-elevated',
};

export function Chat() {
    // const { customerId, customerName } = useAuth();
    const customerId = useAuthStore((s) => s.customerId);
    const customerName = useAuthStore((s) => s.customerName);

    const { messages, toolStatuses, thinkingChunks, triageCategory, triageConfidence,
        isStreaming, error, sendMessage, clearChat } = useChatStream(customerId!);

    const [input, setInput] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom as new content arrives
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, toolStatuses]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || isStreaming) return;
        setInput('');
        await sendMessage(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-3rem)] max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-lg font-semibold text-white">Chat with {customerName}</h1>
                    <p className="text-muted text-xs">Messages stream in real time · Tools show live status</p>
                </div>
                <div className="flex items-center gap-3">
                    {triageCategory && (
                        <span className={`text-xs font-mono px-2 py-1 rounded ${AGENT_COLORS[triageCategory] ?? 'text-muted bg-elevated'}`}>
              {triageCategory} · {Math.round((triageConfidence ?? 0) * 100)}%
            </span>
                    )}
                    <button onClick={clearChat} className="text-muted hover:text-red transition-colors" title="Clear chat">
                        <Trash2 size={15} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                {messages.length === 0 && (
                    <div className="text-center text-muted text-sm py-16">
                        <p className="mb-3">Send a message to start the conversation.</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {[
                                'Can I get a refund for last month?',
                                "What's included in the Pro plan?",
                                'I want to cancel my subscription',
                                'Why did my payment fail?',
                            ].map(q => (
                                <button key={q} onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                                        className="text-xs bg-elevated border border-border hover:border-accent text-muted hover:text-accent px-3 py-1.5 rounded-full transition-colors">
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            msg.role === 'user'
                                ? 'bg-accent text-white rounded-br-md'
                                : 'bg-surface border border-border text-white rounded-bl-md'
                        }`}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                    </div>
                ))}

                {/* Live tool statuses — shown while streaming */}
                {isStreaming && toolStatuses.length > 0 && (
                    <div className="flex justify-start">
                        <div className="flex flex-col gap-1.5">
                            {toolStatuses.map((ts, i) => <ToolBadge key={i} status={ts} />)}
                        </div>
                    </div>
                )}

                {/* Extended thinking indicator */}
                {isStreaming && thinkingChunks.length > 0 && (
                    <div className="flex justify-start">
                        <div className="flex items-center gap-2 text-xs text-accent bg-accent/5 border border-accent/20 px-3 py-1.5 rounded-md font-mono">
                            <Brain size={12} className="animate-pulse" />
                            Extended thinking active…
                        </div>
                    </div>
                )}

                {error && <p className="text-red text-sm text-center">{error}</p>}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border pt-4">
                <div className="flex gap-2 bg-surface border border-border rounded-xl p-2">
          <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your subscription…"
              rows={1}
              disabled={isStreaming}
              className="flex-1 bg-transparent text-white text-sm placeholder-muted resize-none outline-none py-1.5 px-2 min-h-[36px] max-h-32"
              style={{ height: 'auto' }}
              onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
          />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isStreaming}
                        className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all self-end"
                    >
                        <Send size={15} className="text-white" />
                    </button>
                </div>
                <p className="text-dim text-[10px] mt-1.5 text-center font-mono">Enter to send · Shift+Enter for new line</p>
            </div>
        </div>
    );
}
