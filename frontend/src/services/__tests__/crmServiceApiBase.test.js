import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each([
  [false, '', '/api/v1/crm-mock/leads'],
  [true, '', 'http://127.0.0.1:8000/api/v1/crm-mock/leads'],
  [false, 'https://backend.example.test/', 'https://backend.example.test/api/v1/crm-mock/leads'],
])('resuelve el endpoint CRM sin fallback local en producción (DEV=%s, URL=%s)', async (dev, configuredUrl, expected) => {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  vi.stubEnv('VITE_API_URL', configuredUrl);
  vi.stubEnv('VITE_BACKEND_URL', '');
  vi.stubEnv('VITE_API_BASE_URL', '');
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ leads: [] }) }));
  vi.stubGlobal('fetch', fetch);
  const { getSimulatedCrmLeads } = await import('../crmService');
  expect(await getSimulatedCrmLeads()).toEqual([]);
  expect(fetch).toHaveBeenCalledWith(expected, expect.any(Object));
});
