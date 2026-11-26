import type { CorsOptions } from 'cors';
export declare const PRODUCTION_ALLOWED_ORIGINS: readonly ["https://collection.dfarm.in", "https://dairy.dfarm.in", "https://admin.dfarm.in", "https://dfarm-collection.pages.dev", "https://dfarm-dairy-admin.pages.dev", "https://dfarm-super-admin.pages.dev"];
export declare function getAllowedCorsOrigins(): string[];
export declare function isOriginAllowed(requestOrigin: string | undefined): boolean;
export declare const corsOptions: CorsOptions;
//# sourceMappingURL=cors.d.ts.map