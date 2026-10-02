// Tiny typed wrapper around fetch() for the REST endpoints.
// Paths are relative: the Vite dev server proxies /api to FastAPI.

import type { SessionDetail, SessionSummary, Settings } from './types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(res.status, detail)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const api = {
  health: () => request<{ status: string; active_sessions: number[] }>('/api/health'),

  getSettings: () => request<Settings>('/api/settings'),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  resetSettings: () => request<Settings>('/api/settings/reset', { method: 'POST' }),

  startSession: () => request<SessionSummary>('/api/sessions/start', { method: 'POST' }),
  stopSession: (id: number) => request<SessionSummary>(`/api/sessions/${id}/stop`, { method: 'POST' }),
  listSessions: () => request<SessionSummary[]>('/api/sessions'),
  getSession: (id: number) => request<SessionDetail>(`/api/sessions/${id}`),
  deleteSession: (id: number) => request<void>(`/api/sessions/${id}`, { method: 'DELETE' }),
}
