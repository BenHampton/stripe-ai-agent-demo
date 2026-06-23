import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { useAuthStore, SEED_CUSTOMERS } from '@/store/auth';
import { Loader2 } from 'lucide-react';

export function AppShell() {

    // Plain field reads. AppShell is a top-level layout component and the auth store
    // changes ~twice a session (select / logout), so a re-render here is effectively
    // free — useShallow would guard against churn that doesn't happen. Reach for a
    // useShallow group selector only when a component reads multiple fields from a
    // FREQUENTLY-changing store; here it would just be ceremony.
    const customerId     = useAuthStore((s) => s.customerId);
    const customerName   = useAuthStore((s) => s.customerName);
    const isLoading      = useAuthStore((s) => s.isLoading);
    const error          = useAuthStore((s) => s.error);
    const selectCustomer = useAuthStore((s) => s.selectCustomer);


    // If no customer is selected, show the customer picker
    if (!customerId) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center p-6">
                <div className="bg-surface border border-border rounded-xl p-8 max-w-sm w-full">
                    <div className="text-accent font-mono text-xs tracking-widest uppercase mb-2">stripe-ai-agent-demo</div>
                    <h1 className="text-xl font-bold text-white mb-1">Select a test customer</h1>
                    <p className="text-muted text-sm mb-6">
                        These are the four seed customers from the Stripe seed script.
                        Each is preconfigured with a different subscription state for demo scenarios.
                    </p>
                    <div className="flex flex-col gap-3">
                        {SEED_CUSTOMERS.map(c => (
                            <button
                                key={c.id}
                                onClick={() => selectCustomer(c.id, c.name)}
                                disabled={isLoading}
                                className="flex items-center justify-between p-3 rounded-lg bg-elevated border border-border hover:border-accent transition-colors text-left group"
                            >
                                <div>
                                    <div className="text-white font-medium text-sm group-hover:text-accent transition-colors">{c.name}</div>
                                    <div className="text-muted text-xs">{c.plan} plan</div>
                                </div>
                                <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                                    c.status === 'happy' ? 'bg-green/10 text-green' :
                                        c.status === 'at-risk' ? 'bg-yellow/10 text-yellow' :
                                            c.status === 'payment-failed' ? 'bg-red/10 text-red' :
                                                'bg-blue/10 text-blue'
                                }`}>{c.status}</span>
                            </button>
                        ))}
                    </div>
                    {isLoading && <div className="flex justify-center mt-4"><Loader2 className="animate-spin text-accent" size={20} /></div>}
                    {error   && <p className="text-red text-sm mt-3">{error}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-bg">
            <Sidebar customerName={customerName!} />
            <main className="ml-56 flex-1 p-6 max-w-5xl">
                <Outlet />
            </main>
        </div>
    );
}