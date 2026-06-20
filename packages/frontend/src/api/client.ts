/**
 * REST API client — all backend calls go through here.
 * Handles auth headers, JSON parsing, and typed errors.
 */

const API_BASE = '/api';

function getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('agent_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

function getAdminHeaders(): HeadersInit {
    const apiKey = localStorage.getItem('agent_api_key') ?? 'demo-admin-key';
    return {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
    };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
        const body = await res.text().catch(() => 'Unknown error');
        throw new Error(`API error ${res.status}: ${body}`);
    }
    return res.json() as T;
}

// Auth 

export async function getToken(customerId: string): Promise<string> {
    const res = await apiFetch<{ token: string }>('/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
    });
    localStorage.setItem('agent_token', res.token);
    localStorage.setItem('customer_id', customerId);
    return res.token;
}

// Conversations 

export async function listConversations(params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams(params as any).toString();
    return apiFetch<{ conversations: import('./types').Conversation[] }>(
        `/dashboard/conversations${qs ? '?' + qs : ''}`,
        { headers: getAdminHeaders() },
    );
}

export async function getConversationMessages(id: string) {
    return apiFetch<{ messages: import('./types').Message[]; trace: import('./types').AgentTrace | null }>(
        `/dashboard/conversations/${id}/detail`,
        { headers: getAdminHeaders() },
    );
}

// Approvals 

export async function listApprovals() {
    return apiFetch<{ approvals: import('./types').PendingApproval[] }>(
        '/approvals',
        { headers: getAdminHeaders() },
    );
}

export async function reviewApproval(id: string, decision: 'approved' | 'rejected', reviewedBy: string, note?: string) {
    return apiFetch<unknown>(`/approvals/${id}/review`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ decision, reviewedBy, note }),
    });
}

// Dashboard 

export async function getDashboardMetrics() {
    return apiFetch<import('./types').DashboardMetrics>(
        '/dashboard/metrics',
        { headers: getAdminHeaders() },
    );
}

// Retention scan 

export async function triggerRetentionScan() {
    return apiFetch<unknown>('/retention/scan', {
        method: 'POST',
        headers: getAdminHeaders(),
    });
}