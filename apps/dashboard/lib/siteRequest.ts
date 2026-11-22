/** Calls the dashboard API with the session cookie; reloads into /login once it expires. */
export async function siteRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  if (response.status === 401) {
    window.location.reload(); // proxy.ts redirects to /login
    throw new Error("Phiên đăng nhập đã hết hạn.");
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Không thể truy cập dữ liệu.");
  return body;
}
