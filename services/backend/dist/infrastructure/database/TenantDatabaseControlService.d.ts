import { IDatabaseClient, TenantDatabaseMapping } from './TenantDatabaseManager.js';
export type TableDataCategory = 'CATEGORY_A_OPERATIONAL' | 'CATEGORY_B_LIFECYCLE' | 'CATEGORY_C_FINANCIAL' | 'CATEGORY_D_SECURITY';
export type TableAccessMode = 'CONTROLLED_CRUD' | 'LIFECYCLE_ACTION_ONLY' | 'IMMUTABLE_FINANCIAL' | 'SECURITY_PROTECTED' | 'READ_ONLY';
export interface TableSummary {
    tableName: string;
    schemaName: string;
    rowCount: number;
    columnCount: number;
    primaryKey: string[];
    foreignKeys: {
        column: string;
        targetTable: string;
        targetColumn: string;
    }[];
    indexCount: number;
    tableSize?: string;
    category: TableDataCategory;
    accessMode: TableAccessMode;
    isView: boolean;
}
export interface ColumnDetail {
    columnName: string;
    dataType: string;
    isNullable: boolean;
    columnDefault: string | null;
    isPrimaryKey: boolean;
    foreignKey?: {
        targetTable: string;
        targetColumn: string;
    };
    isSensitive: boolean;
}
export interface ConstraintDetail {
    name: string;
    type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';
    definition?: string;
}
export interface IndexDetail {
    indexName: string;
    isUnique: boolean;
    columns: string[];
    definition?: string;
}
export interface TableSchemaDetail {
    tableName: string;
    schemaName: string;
    columns: ColumnDetail[];
    constraints: ConstraintDetail[];
    indexes: IndexDetail[];
    category: TableDataCategory;
    accessMode: TableAccessMode;
    rowCount: number;
    relatedTables: {
        incoming: {
            table: string;
            column: string;
            foreignColumn: string;
        }[];
        outgoing: {
            table: string;
            column: string;
            foreignColumn: string;
        }[];
    };
}
export interface PaginatedRecordsResult {
    tableName: string;
    category: TableDataCategory;
    accessMode: TableAccessMode;
    totalRecords: number;
    page: number;
    limit: number;
    records: Record<string, any>[];
    primaryKeyColumns: string[];
}
export interface AuditContext {
    userId?: string;
    userRole?: string;
    fullName?: string;
    reason?: string;
    ipAddress?: string;
    correlationId?: string;
}
export declare class TenantDatabaseControlService {
    private static instance;
    private constructor();
    static getInstance(): TenantDatabaseControlService;
    /**
     * Safely quotes a PostgreSQL SQL identifier (table, column, schema)
     * to strictly prevent SQL injection.
     */
    private quoteIdent;
    /**
     * Resolves the target tenant database client and its central mapping.
     */
    getTenantContext(dairyId: string): Promise<{
        client: IDatabaseClient;
        mapping: TenantDatabaseMapping | null;
    }>;
    /**
     * Module 2.1: Database Overview
     */
    getDatabaseOverview(dairyId: string): Promise<{
        dairyId: string;
        dairyCode: string;
        databaseName: string;
        resourceType: string;
        provisioningStatus: string;
        connectionHealth: 'HEALTHY' | 'UNAVAILABLE' | 'CONNECTION_FAILED' | 'NOT_CHECKED';
        migrationStatus: 'CURRENT' | 'PENDING_MIGRATIONS' | 'FAILED' | 'SCHEMA_DRIFT' | 'NOT_VERIFIED';
        schemaVersion: string;
        postgresVersion: string;
        totalTables: number;
        totalViews: number;
        totalIndexes: number;
        totalSequences: number;
        totalRows: number;
        estimatedSize: string;
        lastVerifiedAt: string;
    }>;
    /**
     * Module 2.2: All Tables Listing (Dynamic Catalog Discovery)
     */
    listTables(dairyId: string): Promise<TableSummary[]>;
    /**
     * Module 2.3: Table Detail & Schema Inspection
     */
    getTableSchema(dairyId: string, tableName: string): Promise<TableSchemaDetail>;
    /**
     * Module 2.3 & 2.4: Paginated Record Listing with Search, Sort, and Masking
     */
    getTableRecords(dairyId: string, tableName: string, params: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'ASC' | 'DESC';
        filterField?: string;
        filterValue?: string;
    }): Promise<PaginatedRecordsResult>;
    /**
     * Module 2.4: Single Record Detail
     */
    getRecordById(dairyId: string, tableName: string, recordId: string): Promise<Record<string, any> | null>;
    /**
     * Module 3: Controlled Insert Record
     */
    insertRecord(dairyId: string, tableName: string, data: Record<string, any>, audit: AuditContext): Promise<Record<string, any>>;
    /**
     * Module 3: Controlled Update Record
     */
    updateRecord(dairyId: string, tableName: string, recordId: string, updates: Record<string, any>, audit: AuditContext): Promise<Record<string, any>>;
    /**
     * Module 3: Controlled Soft Delete Record
     */
    deleteRecord(dairyId: string, tableName: string, recordId: string, audit: AuditContext): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Module 4: Database Connection Verification
     */
    verifyConnection(dairyId: string): Promise<{
        success: boolean;
        databaseName: string;
        latencyMs: number;
        health: string;
        details?: string;
    }>;
    /**
     * Module 4: Schema Validation against Migration Manifest
     */
    validateSchema(dairyId: string): Promise<{
        isValid: boolean;
        appliedMigrations: number;
        totalExpectedMigrations: number;
        missingTables: string[];
        discoveredTablesCount: number;
    }>;
    /**
     * Module 4: View Migration Status
     */
    getMigrationHistory(dairyId: string): Promise<{
        totalManifest: number;
        tenantOperationalTrack: {
            version: string;
            filename: string;
            description: string;
            status: string;
        }[];
    }>;
    /**
     * Mask sensitive attributes according to Category D rules
     */
    private maskSensitiveRecord;
    private isColumnSensitive;
    private getPrimaryKeyColumns;
    private getForeignKeys;
    private recordAuditLog;
}
export declare const tenantDbControlService: TenantDatabaseControlService;
//# sourceMappingURL=TenantDatabaseControlService.d.ts.map