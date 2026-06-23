import { NavLink } from 'react-router';
import { MessageSquare, List, CheckSquare, BarChart2, Zap, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

const NAV = [
    { to: '/chat',          label: 'Chat',          Icon: MessageSquare },
    { to: '/conversations',  label: 'Conversations',  Icon: List },
    { to: '/approvals',      label: 'Approvals',      Icon: CheckSquare },
    { to: '/dashboard',      label: 'Dashboard',      Icon: BarChart2 },
    { to: '/simulate',       label: 'Simulate',       Icon: Zap },
];

export function Sidebar({ customerName }: { customerName: string }) {
    const logout = useAuthStore((s) => s.logout);
    return (
        <nav className="fixed left-0 top-0 h-full w-56 bg-surface border-r border-border flex flex-col z-40">
            <div className="p-4 border-b border-border">
                <div className="text-accent font-mono text-[10px] tracking-widest uppercase">Agent Demo</div>
                <div className="text-white text-sm font-semibold mt-0.5 truncate">{customerName}</div>
            </div>
            <div className="flex-1 py-3">
                {NAV.map(({ to, label, Icon }) => (
                    <NavLink
                        key={to} to={to}
                        className={({ isActive }) =>
                            `flex items-center gap-2.5 px-4 py-2 text-sm transition-colors
               border-l-2 ${isActive
                                ? 'text-accent border-accent bg-accent/5'
                                : 'text-muted border-transparent hover:text-white hover:bg-white/3'}`
                        }
                    >
                        <Icon size={16} />
                        {label}
                    </NavLink>
                ))}
            </div>
            <div className="p-3 border-t border-border">
                <button
                    onClick={logout}
                    className="flex items-center gap-2 text-muted text-xs hover:text-white transition-colors w-full px-1 py-1"
                >
                    <LogOut size={13} /> Switch customer
                </button>
            </div>
        </nav>
    );
}