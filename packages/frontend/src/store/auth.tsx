import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getToken } from '@/api/client';

// The four seed customers from Section 5 — used for the demo picker.
// Replace *_CUSTOMER_ID with the real cus_... IDs (run: pnpm --filter @sai/backend check:stripe).
export const SEED_CUSTOMERS = [
    { id: 'cus_UixfvcJsEi2xxg', name: 'Alice', plan: 'Pro',        status: 'happy'         },
    { id: 'BOB_CUSTOMER_ID',   name: 'Bob',   plan: 'Starter',    status: 'at-risk'       },
    { id: 'CAROL_CUSTOMER_ID', name: 'Carol', plan: 'Pro',        status: 'payment-failed' },
    { id: 'DAVE_CUSTOMER_ID',  name: 'Dave',  plan: 'Enterprise', status: 'refund-seeker'  },
] as const;

interface AuthState {
    customerId:   string | null;
    customerName: string | null;
    isLoading:    boolean;
    error:        string | null;
    selectCustomer: (id: string, name: string) => Promise<void>;
    logout:       () => void;
}

// Zustand store. Replaces the old Context + scattered localStorage calls:
//  - State is global and reactive — no Provider needed in main.tsx.
//  - The persist middleware handles storage declaratively (one config) instead of
//    manual getItem/setItem strewn across the component.
//  - partialize persists ONLY identity (customerId/name) — never transient UI state
//    like isLoading/error, which should always reset on reload.
export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            customerId:   null,
            customerName: null,
            isLoading:    false,
            error:        null,

            selectCustomer: async (id, name) => {
                set({ isLoading: true, error: null });
                try {
                    await getToken(id); // fetch + store the agent token (see api/client)
                    set({ customerId: id, customerName: name, isLoading: false });
                } catch (err) {
                    set({ error: err instanceof Error ? err.message : 'Auth failed', isLoading: false });
                }
            },

            logout: () => set({ customerId: null, customerName: null, error: null }),
        }),
        {
            name: 'sai-auth', // localStorage key
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({ customerId: state.customerId, customerName: state.customerName }),
        },
    ),
);

// Consume with narrow selectors so each component re-renders only when the slice
// it actually reads changes:
//   const customerId = useAuthStore((s) => s.customerId);   // single field
//   const logout     = useAuthStore((s) => s.logout);       // single action
// When a component genuinely needs several fields, group them with useShallow so it
// re-renders only when one of THOSE changes (see AppShell's customer picker):
//   const { isLoading, error, selectCustomer } = useAuthStore(
//     useShallow((s) => ({ isLoading: s.isLoading, error: s.error, selectCustomer: s.selectCustomer })),
//   );
// Avoid selecting the whole store object — that re-renders on every state change.