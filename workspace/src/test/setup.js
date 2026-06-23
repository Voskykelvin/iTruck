import '@testing-library/jest-dom/vitest';
import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { server } from './mocks/server.js';

vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: () => mockSocket,
    emit: () => mockSocket,
    disconnect: () => {},
  };
  return {
    default: () => mockSocket,
  };
});


// Setup MSW
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Polyfill window.matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });

  // Polyfill URL methods
  window.URL.createObjectURL = () => 'blob:mock-url';
  window.URL.revokeObjectURL = () => {};

  // Polyfill geolocation
  navigator.geolocation = {
    getCurrentPosition: vi.fn().mockImplementation((success) =>
      success({
        coords: {
          latitude: -1.2921,
          longitude: 36.8219,
          accuracy: 10,
          speed: 0,
          heading: 0
        },
        timestamp: Date.now()
      })
    ),
    watchPosition: vi.fn().mockImplementation((success) => {
      // Delay slightly to prevent infinite synchronous loop issues if components trigger updates synchronously
      setTimeout(() => {
        success({
          coords: {
            latitude: -1.2921,
            longitude: 36.8219,
            accuracy: 10,
            speed: 0,
            heading: 0
          },
          timestamp: Date.now()
        });
      }, 0);
      return 123;
    }),
    clearWatch: vi.fn()
  };
}
