export declare class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string);
}
export declare function request<T>(endpoint: string, options?: RequestInit): Promise<T>;
export declare function downloadFile(endpoint: string, fallbackFilename?: string): Promise<void>;
export declare const apiClient: {
    get: <T>(url: string, params?: Record<string, any>) => Promise<T>;
    post: <T>(url: string, body?: any) => Promise<T>;
    patch: <T>(url: string, body?: any) => Promise<T>;
    put: <T>(url: string, body?: any) => Promise<T>;
    delete: <T>(url: string, body?: any) => Promise<T>;
    download: typeof downloadFile;
};
//# sourceMappingURL=client.d.ts.map