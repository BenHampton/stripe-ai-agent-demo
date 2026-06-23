import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { getToken } from '@/api/client';

// The four seed customers from Section 5 — used for the demo
export const SEED_CUSTOMERS = [
    { id: 'cus_UixfvcJsEi2xxg', name: 'Alice', plan: 'Pro',        status: 'happy'         },
    { id: 'BOB_CUSTOMER_ID',   name: 'Bob',   plan: 'Starter',    status: 'at-risk'       },
    { id: 'CAROL_CUSTOMER_ID', name: 'Carol', plan: 'Pro',        status: 'payment-failed' },
    { id: 'DAVE_CUSTOMER_ID',  name: 'Dave',  plan: 'Enterprise', status: 'refund-seeker' },
] as const;
// Note: Replace *_CUSTOMER_ID with actual cus_... IDs from your Stripe seed output

interface AuthState {
    customerId:   string | null;
    customerName: string | null;
    isLoading:    boolean;
    error:        string | null;
    selectCustomer: (id: string, name: string) => Promise<void>;
    logout:       () => void;
}

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
    const storedId   = localStorage.getItem('customer_id');
    const storedName = localStorage.getItem('customer_name');

    const [customerId,   setCustomerId]   = useState<string | null>(storedId);
    const [customerName, setCustomerName] = useState<string | null>(storedName);
    const [isLoading,    setIsLoading]    = useState(false);
    const [error,        setError]        = useState<string | null>(null);

    const selectCustomer = useCallback(async (id: string, name: string) => {
        setIsLoading(true); setError(null);
        try {
            await getToken(id);
            localStorage.setItem('customer_name', name);
            setCustomerId(id); setCustomerName(name);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Auth failed');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('agent_token');
        localStorage.removeItem('customer_id');
        localStorage.removeItem('customer_name');
        setCustomerId(null); setCustomerName(null);
    }, []);

    return (
        <AuthContext.Provider value={{ customerId, customerName, isLoading, error, selectCustomer, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);