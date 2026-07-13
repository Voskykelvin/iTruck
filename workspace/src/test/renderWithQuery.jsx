import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createAppQueryClient } from '../queryClient.js';

export function renderWithQuery(ui) {
  const queryClient = createAppQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false }
  });
  return render(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  });
}
