import { db } from '../../../infrastructure/database/PostgresPool.js';
import { logger } from '../../../shared/logger/index.js';
import { tenantDbManager } from '../../../infrastructure/database/TenantDatabaseManager.js';

export interface NearbyDairyResult {
  id: string;
  dairyId: string;
  name: string;
  dairyName: string;
  code: string;
  registrationNumber: string;
  village: string;
  district: string;
  state: string;
  contactPhone: string;
  associatedPerson: string;
  adminName: string;
  associatedPersonPhone: string;
  centerId: string | null;
  centerCode: string | null;
  centerName: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  distanceKm: number | null;
  distanceMeters: number | null;
  distanceLabel: string | null;
  isActive: boolean;
  discoveryStatus: string;
  provisioningStatus?: string;
  isRegistrationEligible?: boolean;
  registrationBlockReason?: string;
  isOperational?: boolean;
}

export interface NearbyDairiesOutput {
  items: NearbyDairyResult[];
  searchRadiusMeters: number;
  totalFound: number;
}

// Default search radius: 50 km (covers typical district & neighboring talukas)
// Extended to 150 km when no GPS coordinates supplied (regional directory mode)
const DEFAULT_RADIUS_KM = 50;
const EXTENDED_RADIUS_KM = 150;

export class GetNearbyDairiesUseCase {
  public async execute(
    lat?: number,
    lng?: number,
    searchQuery?: string,
    radiusKm?: number
  ): Promise<NearbyDairyResult[]> {
    const hasCoords =
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    const effectiveRadiusKm = radiusKm ?? (hasCoords ? DEFAULT_RADIUS_KM : EXTENDED_RADIUS_KM);

    try {
      let sql: string;
      let params: any[];

      if (hasCoords) {
        // Haversine-based proximity search using PostgreSQL math
        // Returns dairies sorted nearest-first with accurate distance in km
        sql = `
          WITH haversine AS (
            SELECT
              o.id,
              o.code,
              o.name,
              o.status,
              o.latitude,
              o.longitude,
              o.formatted_address,
              o.village_locality,
              o.city,
              o.district,
              o.state,
              o.business_phone,
              u.full_name AS admin_name,
              COALESCE(u.mobile_number, u.phone_number) AS admin_mobile,
              dc.id   AS center_id,
              dc.code AS center_code,
              dc.name AS center_name,
              -- Haversine great-circle distance in km
              (
                6371.0 * acos(
                  CASE 
                    WHEN (
                      cos(radians($1::double precision))
                      * cos(radians(o.latitude::double precision))
                      * cos(radians(o.longitude::double precision) - radians($2::double precision))
                      + sin(radians($1::double precision))
                      * sin(radians(o.latitude::double precision))
                    ) > 1.0 THEN 1.0
                    WHEN (
                      cos(radians($1::double precision))
                      * cos(radians(o.latitude::double precision))
                      * cos(radians(o.longitude::double precision) - radians($2::double precision))
                      + sin(radians($1::double precision))
                      * sin(radians(o.latitude::double precision))
                    ) < -1.0 THEN -1.0
                    ELSE (
                      cos(radians($1::double precision))
                      * cos(radians(o.latitude::double precision))
                      * cos(radians(o.longitude::double precision) - radians($2::double precision))
                      + sin(radians($1::double precision))
                      * sin(radians(o.latitude::double precision))
                    )
                  END
                )
              ) AS distance_km
            FROM organizations o
            LEFT JOIN (
              SELECT DISTINCT ON (organization_id)
                organization_id,
                full_name,
                mobile_number,
                phone_number
              FROM users
              WHERE (user_role = 'DAIRY_ADMIN' OR role IN ('DAIRY_ADMIN', 'SUPER_ADMIN'))
              ORDER BY organization_id, created_at DESC
            ) u ON u.organization_id = o.id
            LEFT JOIN (
              SELECT DISTINCT ON (organization_id)
                organization_id,
                id,
                code,
                name
              FROM dairy_centers
              WHERE status = 'ACTIVE'
              ORDER BY organization_id, created_at ASC
            ) dc ON dc.organization_id = o.id
            WHERE
              o.latitude  IS NOT NULL
              AND o.longitude IS NOT NULL
              AND o.latitude  <> 0
              AND o.longitude <> 0
              AND o.latitude  BETWEEN -90  AND 90
              AND o.longitude BETWEEN -180 AND 180
              -- Bounding-box pre-filter to leverage the geo index
              AND o.latitude  BETWEEN ($1::double precision - ($4::double precision / 111.0))
                              AND     ($1::double precision + ($4::double precision / 111.0))
              AND o.longitude BETWEEN ($2::double precision - ($4::double precision / (111.0 * cos(radians($1::double precision)))))
                              AND     ($2::double precision + ($4::double precision / (111.0 * cos(radians($1::double precision)))))
              AND UPPER(o.status) NOT IN ('SUSPENDED', 'DELETED', 'DISABLED')
              AND (
                $3::text IS NULL OR $3 = ''
                OR LOWER(o.name)             LIKE LOWER('%' || $3 || '%')
                OR LOWER(COALESCE(o.village_locality, '')) LIKE LOWER('%' || $3 || '%')
                OR LOWER(COALESCE(o.district, ''))         LIKE LOWER('%' || $3 || '%')
                OR LOWER(COALESCE(o.code, ''))             LIKE LOWER('%' || $3 || '%')
              )
          )
          SELECT *
          FROM haversine
          WHERE distance_km <= $4::double precision
          ORDER BY distance_km ASC;
        `;
        params = [lat, lng, searchQuery || null, effectiveRadiusKm];
      } else {
        // No coordinates: return all eligible dairies, optionally filtered by search
        sql = `
          SELECT
            o.id,
            o.code,
            o.name,
            o.status,
            o.latitude,
            o.longitude,
            o.formatted_address,
            o.village_locality,
            o.city,
            o.district,
            o.state,
            o.business_phone,
            u.full_name AS admin_name,
            COALESCE(u.mobile_number, u.phone_number) AS admin_mobile,
            dc.id   AS center_id,
            dc.code AS center_code,
            dc.name AS center_name,
            NULL::double precision AS distance_km
          FROM organizations o
          LEFT JOIN (
            SELECT DISTINCT ON (organization_id)
              organization_id,
              full_name,
              mobile_number,
              phone_number
            FROM users
            WHERE (user_role = 'DAIRY_ADMIN' OR role IN ('DAIRY_ADMIN', 'SUPER_ADMIN'))
            ORDER BY organization_id, created_at DESC
          ) u ON u.organization_id = o.id
          LEFT JOIN (
            SELECT DISTINCT ON (organization_id)
              organization_id,
              id,
              code,
              name
            FROM dairy_centers
            WHERE status = 'ACTIVE'
            ORDER BY organization_id, created_at ASC
          ) dc ON dc.organization_id = o.id
          WHERE
            UPPER(o.status) NOT IN ('SUSPENDED', 'DELETED', 'DISABLED')
            AND (
              $1::text IS NULL OR $1 = ''
              OR LOWER(o.name)             LIKE LOWER('%' || $1 || '%')
              OR LOWER(COALESCE(o.village_locality, '')) LIKE LOWER('%' || $1 || '%')
              OR LOWER(COALESCE(o.district, ''))         LIKE LOWER('%' || $1 || '%')
              OR LOWER(COALESCE(o.code, ''))             LIKE LOWER('%' || $1 || '%')
            )
          ORDER BY o.name ASC;
        `;
        params = [searchQuery || null];
      }

      let result = await db.query(sql, params);

      // Progressive expansion: if zero dairies found within initial proximity radius,
      // fallback to returning nearest registered active dairies sorted nearest-first
      if (hasCoords && result.rows.length === 0) {
        const fallbackSql = `
          WITH haversine AS (
            SELECT
              o.id,
              o.code,
              o.name,
              o.status,
              o.latitude,
              o.longitude,
              o.formatted_address,
              o.village_locality,
              o.city,
              o.district,
              o.state,
              o.business_phone,
              u.full_name AS admin_name,
              COALESCE(u.mobile_number, u.phone_number) AS admin_mobile,
              dc.id   AS center_id,
              dc.code AS center_code,
              dc.name AS center_name,
              (
                6371.0 * acos(
                  CASE 
                    WHEN (
                      cos(radians($1::double precision))
                      * cos(radians(o.latitude::double precision))
                      * cos(radians(o.longitude::double precision) - radians($2::double precision))
                      + sin(radians($1::double precision))
                      * sin(radians(o.latitude::double precision))
                    ) > 1.0 THEN 1.0
                    WHEN (
                      cos(radians($1::double precision))
                      * cos(radians(o.latitude::double precision))
                      * cos(radians(o.longitude::double precision) - radians($2::double precision))
                      + sin(radians($1::double precision))
                      * sin(radians(o.latitude::double precision))
                    ) < -1.0 THEN -1.0
                    ELSE (
                      cos(radians($1::double precision))
                      * cos(radians(o.latitude::double precision))
                      * cos(radians(o.longitude::double precision) - radians($2::double precision))
                      + sin(radians($1::double precision))
                      * sin(radians(o.latitude::double precision))
                    )
                  END
                )
              ) AS distance_km
            FROM organizations o
            LEFT JOIN (
              SELECT DISTINCT ON (organization_id)
                organization_id,
                full_name,
                mobile_number,
                phone_number
              FROM users
              WHERE (user_role = 'DAIRY_ADMIN' OR role IN ('DAIRY_ADMIN', 'SUPER_ADMIN'))
              ORDER BY organization_id, created_at DESC
            ) u ON u.organization_id = o.id
            LEFT JOIN (
              SELECT DISTINCT ON (organization_id)
                organization_id,
                id,
                code,
                name
              FROM dairy_centers
              WHERE status = 'ACTIVE'
              ORDER BY organization_id, created_at ASC
            ) dc ON dc.organization_id = o.id
            WHERE
              o.latitude IS NOT NULL
              AND o.longitude IS NOT NULL
              AND o.latitude <> 0
              AND o.longitude <> 0
              AND o.latitude BETWEEN -90 AND 90
              AND o.longitude BETWEEN -180 AND 180
              AND UPPER(o.status) NOT IN ('SUSPENDED', 'DELETED', 'DISABLED')
              AND (
                $3::text IS NULL OR $3 = ''
                OR LOWER(o.name)             LIKE LOWER('%' || $3 || '%')
                OR LOWER(COALESCE(o.village_locality, '')) LIKE LOWER('%' || $3 || '%')
                OR LOWER(COALESCE(o.district, ''))         LIKE LOWER('%' || $3 || '%')
                OR LOWER(COALESCE(o.code, ''))             LIKE LOWER('%' || $3 || '%')
              )
          )
          SELECT *
          FROM haversine
          ORDER BY distance_km ASC
          LIMIT 20;
        `;
        result = await db.query(fallbackSql, [lat, lng, searchQuery || null]);
      }

      return result.rows.map((row: any) => {
        const distKm = row.distance_km !== null && row.distance_km !== undefined
          ? parseFloat(Number(row.distance_km).toFixed(2))
          : null;
        const distMeters = distKm !== null ? Math.round(distKm * 1000) : null;

        let distanceLabel: string | null = null;
        if (distMeters !== null) {
          distanceLabel = distMeters < 1000
            ? `${distMeters} m`
            : `${(distMeters / 1000).toFixed(1)} km`;
        }

        const status = (row.status || '').toUpperCase();
        const isActive = !['SUSPENDED', 'DELETED', 'DISABLED'].includes(status);
        const tenantMapping = tenantDbManager.getTenantMapping(row.id);
        const provisioningStatus = tenantMapping?.provisioningStatus || (isActive ? 'ACTIVE' : 'PENDING');
        const isRegistrationEligible = isActive && (provisioningStatus === 'ACTIVE' || (provisioningStatus as string) === 'READY');
        const registrationBlockReason = !isRegistrationEligible
          ? (provisioningStatus === 'FAILED'
              ? 'Dairy database setup failed. Please contact dairy support.'
              : 'Dairy database is currently initializing. Not ready for new registrations.')
          : undefined;

        return {
          id: row.id,
          dairyId: row.id,
          name: row.name,
          dairyName: row.name,
          code: row.code,
          registrationNumber: row.code,
          village: row.village_locality || row.city || row.district || 'Local Area',
          district: row.district || '',
          state: row.state || 'Maharashtra',
          contactPhone: row.business_phone || row.admin_mobile || '+91 00000 00000',
          associatedPerson: row.admin_name || 'Dairy Administrator',
          adminName: row.admin_name || 'Dairy Administrator',
          associatedPersonPhone: row.admin_mobile || row.business_phone || '',
          centerId: row.center_id || null,
          centerCode: row.center_code || null,
          centerName: row.center_name || null,
          latitude: row.latitude !== null ? Number(row.latitude) : null,
          longitude: row.longitude !== null ? Number(row.longitude) : null,
          formattedAddress: row.formatted_address || null,
          distanceKm: distKm,
          distanceMeters: distMeters,
          distanceLabel,
          isActive,
          discoveryStatus: status,
          provisioningStatus,
          isRegistrationEligible,
          registrationBlockReason,
          isOperational: isRegistrationEligible,
        };
      });
    } catch (err: any) {
      logger.error({ error: err.message, stack: err.stack }, 'GetNearbyDairiesUseCase DB query error; falling back to in-memory');
      // If DB is unavailable, return empty array — the route will merge in-memory dairies
      return [];
    }
  }
}
