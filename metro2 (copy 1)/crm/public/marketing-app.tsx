import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalUIProvider } from './GlobalUIProvider.tsx';
import { MarketingPage } from './marketing/MarketingPage.tsx';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <QueryClientProvider client={queryClient}>
      <GlobalUIProvider>
        <MarketingPage />
      </GlobalUIProvider>
    </QueryClientProvider>
  );
}
