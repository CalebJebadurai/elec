import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock localStorage and fetch before importing api
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Must import after localStorage mock is set up
const { api } = await import('../api');

describe('api client', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
    api.setToken(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Token management ──────────────────────────────────

  describe('setToken / getToken', () => {
    it('stores token in localStorage', () => {
      api.setToken('test-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'test-token');
      expect(api.getToken()).toBe('test-token');
    });

    it('removes token from localStorage when null', () => {
      api.setToken('test-token');
      api.setToken(null);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
      expect(api.getToken()).toBeNull();
    });
  });

  // ── Auth headers ──────────────────────────────────────

  describe('auth headers', () => {
    it('includes Authorization header when token is set', async () => {
      api.setToken('my-token');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }));

      // Use getMe which calls get() directly (not cached)
      await api.getMe();

      expect(fetchSpy).toHaveBeenCalled();
      const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = requestInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('omits Authorization header when no token', async () => {
      api.setToken(null);
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }));

      // Use getMe which calls get() directly (not cached)
      await api.getMe();

      const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = requestInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  // ── Error handling ────────────────────────────────────

  describe('error handling', () => {
    it('throws on non-200 GET response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not found', { status: 404, statusText: 'Not Found' })
      );

      // Use getMe which calls get() directly (not cached)
      await expect(api.getMe()).rejects.toThrow('API 404');
    });

    it('includes detail from error body on POST', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Invalid OTP' }), {
          status: 400,
          statusText: 'Bad Request',
        })
      );

      await expect(api.verifyOtp('123', 'token')).rejects.toThrow('Invalid OTP');
    });

    it('falls back to status text when no detail in body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 500, statusText: 'Internal Server Error' })
      );

      await expect(api.verifyOtp('123', 'token')).rejects.toThrow('API 500');
    });
  });

  // ── CSV export (synchronous) ──────────────────────────

  describe('exportCsv', () => {
    it('returns a URL string without making a fetch call', () => {
      const url = api.exportCsv('Tamil_Nadu', 'AE');
      expect(typeof url).toBe('string');
      expect(url).toContain('Tamil_Nadu');
      expect(url).toContain('election_type=AE');
    });
  });
});
