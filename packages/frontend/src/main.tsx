import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router';
import { AppShell } from '@/layout/AppShell';
import { Chat }             from '@/views/Chat';
import { Conversations }    from '@/views/Conversations';
import { ConversationDetail } from '@/views/ConversationDetail';
import { Approvals }        from '@/views/Approvals';
import { Dashboard }        from '@/views/Dashboard';
import { Simulate }         from '@/views/Simulate';
import './index.css';

// React Router v7: createBrowserRouter (data router) replaces BrowserRouter+Routes.
// RouterProvider is imported from react-router (react-router-dom is merged into react-router in v7).

const router = createBrowserRouter([
    {
        path: '/',
        element: <AppShell />, // no provider needed - Zustand store is global
        children: [
            { index: true,         element: <Navigate to='/chat' replace /> },
            { path: 'chat',           element: <Chat /> },
            { path: 'conversations',   element: <Conversations /> },
            { path: 'conversations/:id', element: <ConversationDetail /> },
            { path: 'approvals',       element: <Approvals /> },
            { path: 'dashboard',       element: <Dashboard /> },
            { path: 'simulate',        element: <Simulate /> },
        ],
    },
]);

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);
