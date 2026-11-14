const BASE_URL = (typeof process !== 'undefined' && process.env?.['REACT_APP_API_URL']) || '/api/v1';
export class ApiError extends Error {
    status;
    code;
    constructor(message, status, code) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}
export async function request(endpoint, options = {}) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('dfarm_auth_token') : null;
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers,
    });
    if (response.status === 401) {
        // If unauthorized, clean up token and trigger listener
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dfarm:unauthorized'));
        }
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        if (!response.ok) {
            throw new ApiError(`Request failed with status ${response.status}`, response.status);
        }
        return null;
    }
    const body = await response.json();
    if (!response.ok || body.success === false) {
        const errorMsg = body?.error?.message || response.statusText || 'An unexpected error occurred';
        const errorCode = body?.error?.code;
        throw new ApiError(errorMsg, response.status, errorCode);
    }
    return body.data;
}
export async function downloadFile(endpoint, fallbackFilename = 'document.pdf') {
    const token = typeof window !== 'undefined' ? localStorage.getItem('dfarm_auth_token') : null;
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
    if (!response.ok) {
        throw new ApiError('Failed to download file', response.status);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition');
    let filename = fallbackFilename;
    if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1])
            filename = match[1];
    }
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
}
export const apiClient = {
    get: (url, params) => {
        const qs = params ? new URLSearchParams(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
        return request(`${url}${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },
    post: (url, body) => request(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    patch: (url, body) => request(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    put: (url, body) => request(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
    delete: (url, body) => request(url, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
    download: downloadFile,
};
//# sourceMappingURL=client.js.map