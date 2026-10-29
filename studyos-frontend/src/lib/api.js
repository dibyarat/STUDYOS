export function getApiBaseUrl() {
  const envUrl = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    'https://studyos-backend-t1qz.onrender.com/api/v1/studyos'
  ).trim();
  let base = envUrl.replace(/\/+$/, '');
  if (!base.endsWith('/api/v1/studyos')) {
    base = `${base}/api/v1/studyos`;
  }
  return base;
}

export const API_URL = getApiBaseUrl();

export function resolveEndpoint(path) {
  if (!path) return API_URL;
  if (/^https?:\/\//i.test(path)) return path;

  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath.startsWith('/api/v1/studyos/')) {
    cleanPath = cleanPath.replace('/api/v1/studyos', '');
  } else if (cleanPath === '/api/v1/studyos') {
    cleanPath = '';
  }
  return `${API_URL}${cleanPath}`;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, token, headers = {}, signal } = options;
  const startedAt = performance.now();
  const fullUrl = resolveEndpoint(path);
  let status = 'ERR';

  const finalHeaders = { ...headers };
  if (!(body instanceof FormData)) {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
  }

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response;
  let attempts = 0;
  const maxAttempts = method === 'GET' ? 2 : 1;

  try {
    while (attempts < maxAttempts) {
      attempts++;
      try {
        response = await fetch(fullUrl, {
          method,
          headers: finalHeaders,
          body: body !== undefined ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
          signal,
        });
        status = String(response.status);

        if ((response.status === 502 || response.status === 503 || response.status === 504) && attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        break;
      } catch (err) {
        if (attempts < maxAttempts && (!signal || !signal.aborted)) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw err;
      }
    }

    if (!response.ok) {
      const responseBody = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(responseBody);
      } catch {
        payload = { message: responseBody };
      }
      const error = new ApiError(payload?.error || payload?.message || `Request failed with status ${response.status}`, response.status);
      if (response.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('studyos:session-expired'));
      }
      throw error;
    }

    if (response.status === 204) return null;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();
  } finally {
    if (import.meta.env.DEV) {
      console.debug(`[api] ${method} ${fullUrl} ${status} ${Math.round(performance.now() - startedAt)}ms`);
    }
  }
}

export function apiUpload(path, { method = 'POST', body, token, onProgress } = {}) {
    if (!(body instanceof FormData)) throw new TypeError('File uploads require FormData');
    const fullUrl = resolveEndpoint(path);
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(method, fullUrl);
      if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      });
      request.addEventListener('load', () => {
        let payload;
        try {
          payload = request.responseText ? JSON.parse(request.responseText) : null;
        } catch {
          reject(new Error('The server returned an invalid upload response'));
          return;
        }
        if (request.status >= 200 && request.status < 300) {
          resolve(payload);
          return;
        }
        reject(new Error(payload?.error || payload?.message || `Upload failed with status ${request.status}`));
      });
      request.addEventListener('error', () => reject(new Error('The upload could not reach the server')));
      request.addEventListener('abort', () => reject(new Error('The upload was cancelled')));
      request.send(body);
    });
}
