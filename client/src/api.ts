const API_URL = import.meta.env.VITE_API_URL;

function getToken(): string | null {
  return localStorage.getItem("ptw_token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("ptw_token", token);
  else localStorage.removeItem("ptw_token");
}

interface ApiError {
  message: string;
  issues?: { path: string; message: string }[];
}

export class ApiRequestError extends Error {
  status: number;
  issues?: ApiError["issues"];
  constructor(status: number, body: ApiError) {
    super(body.message);
    this.status = status;
    this.issues = body.issues;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let body: ApiError = { message: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // response wasn't JSON
    }
    throw new ApiRequestError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};