export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  })

  if (!response.ok) {
    let detail = ''
    try {
      const body: unknown = await response.json()
      if (
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string'
      ) {
        detail = body.error
      }
    } catch {
      detail = ''
    }
    throw new ApiError(detail || `请求失败（HTTP ${response.status}）`, response.status)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function jsonRequest(method: 'POST' | 'PATCH' | 'PUT', body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) }
}
