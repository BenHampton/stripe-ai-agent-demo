import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { ToolStatus } from '@/api/sse';

// Human-readable tool names for display
const TOOL_LABELS: Record<string, string> = {
    get_customer:          'Loading customer',
    get_subscription:      'Checking subscription',
    list_invoices:         'Fetching invoices',
    issue_refund:          'Processing refund',
    cancel_subscription:   'Cancelling subscription',
    reactivate_subscription: 'Reactivating subscription',
    apply_discount:        'Applying discount',
    search_knowledge_base: 'Searching policies',
    think:                 'Thinking',
};

export function ToolBadge({ status }: { status: ToolStatus }) {
    const label = TOOL_LABELS[status.tool] ?? status.tool;

    return (
        <div className={`flex items-center gap-2 py-1 px-2.5 rounded-md text-xs font-mono border w-fit ${
            status.status === 'running'  ? 'bg-accent/5 border-accent/20 text-accent' :
                status.status === 'done'     ? 'bg-green/5 border-green/20 text-green' :
                    'bg-yellow/5 border-yellow/20 text-yellow'
        }`}>
            {status.status === 'running' && <Loader2 size={11} className="animate-spin" />}
            {status.status === 'done'    && <CheckCircle size={11} />}
            {status.status === 'blocked' && <XCircle size={11} />}
            <span>{label}</span>
            {status.status === 'done'    && status.durationMs  && <span className="text-muted ml-1">{status.durationMs}ms</span>}
            {status.status === 'blocked' && <span className="text-yellow ml-1">queued</span>}
        </div>
    );
}