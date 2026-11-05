export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (typeof options.body === 'string') headers.set('Content-Type', 'application/json');

  const response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = Array.isArray(error?.message) ? error.message.join(' ') : error?.message;
    throw new ApiError(response.status, typeof message === 'string' ? message : 'The request failed.');
  }

  return response.status === 204 ? undefined as T : response.json();
}

export function request(method: 'POST' | 'PATCH' | 'DELETE', body?: object): RequestInit {
  return { method, body: body ? JSON.stringify(body) : undefined };
}
