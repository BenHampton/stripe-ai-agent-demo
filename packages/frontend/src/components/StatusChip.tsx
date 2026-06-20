type Status = 'active' | 'resolved' | 'escalated' | 'pending_approval' | 'pending_review';

const STATUS_CONFIG: Record<Status, { label: string; classes: string }> = {
    active:           { label: 'Active',          classes: 'bg-blue/10 text-blue border-blue/20'    },
    resolved:         { label: 'Resolved',        classes: 'bg-green/10 text-green border-green/20'  },
    escalated:        { label: 'Escalated',       classes: 'bg-red/10 text-red border-red/20'       },
    pending_approval: { label: 'Needs Approval',  classes: 'bg-yellow/10 text-yellow border-yellow/20' },
    pending_review:   { label: 'Pending Review',  classes: 'bg-accent/10 text-accent border-accent/20' },
};

export function StatusChip({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status as Status] ?? { label: status, classes: 'bg-elevated text-muted border-border' };
    return (
        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${cfg.classes}`}>
      {cfg.label}
    </span>
    );
}