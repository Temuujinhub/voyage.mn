let token = localStorage.getItem('voyage_token') || null;
let onUnauthorized = null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('voyage_token', t);
  else localStorage.removeItem('voyage_token');
}
export function getToken() {
  return token;
}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, { method = 'GET', body, formData, headers = {}, raw = false } = {}) {
  const opts = { method, headers: { ...headers } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (formData) opts.body = formData;
  else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 401 && onUnauthorized) onUnauthorized();
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Алдаа (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
  upload: (p, formData) => request(p, { method: 'POST', formData }),
  raw: (p) => request(p, { raw: true }),
};
