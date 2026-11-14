import { CustomerStatus } from '@dfarm/shared-types';
import { getAdminSupabaseClient } from '../../config/supabase.js';
import { AppError } from '../../shared/errors/app-error.js';
import { query } from '../../config/db.js';
function mapRowToProfile(row) {
    let address = null;
    if (Array.isArray(row.customer_addresses) && row.customer_addresses.length > 0) {
        const rawAddr = row.customer_addresses[0];
        if (rawAddr) {
            address = {
                village: rawAddr.village,
                hamletArea: rawAddr.hamletArea,
                talukaSubdistrict: rawAddr.talukaSubdistrict,
                district: rawAddr.district,
                state: rawAddr.state,
                postalCode: rawAddr.postalCode,
            };
        }
    }
    else if (row.customer_addresses && !Array.isArray(row.customer_addresses)) {
        const rawAddr = row.customer_addresses;
        address = {
            village: rawAddr.village,
            hamletArea: rawAddr.hamletArea,
            talukaSubdistrict: rawAddr.talukaSubdistrict,
            district: rawAddr.district,
            state: rawAddr.state,
            postalCode: rawAddr.postalCode,
        };
    }
    const permittedCategories = [];
    if (Array.isArray(row.customer_milk_categories)) {
        for (const item of row.customer_milk_categories) {
            if (item.is_authorized && (item.milk_category === 'COW' || item.milk_category === 'BUFFALO')) {
                permittedCategories.push(item.milk_category);
            }
        }
    }
    return {
        id: row.id,
        organizationId: row.organization_id,
        primaryCenterId: row.primary_center_id,
        farmerCode: row.farmer_code,
        fullName: row.full_name,
        normalizedMobileNumber: row.normalized_mobile_number,
        status: row.status,
        registrationStatus: row.registration_status,
        bankName: row.bank_name,
        bankAccountNumber: row.bank_account_number,
        bankIfscCode: row.bank_ifsc_code,
        bankAccountHolderName: row.bank_account_holder_name,
        isDeleted: row.is_deleted,
        deletedAt: row.deleted_at,
        deletionReason: row.deletion_reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        permittedCategories,
        address,
    };
}
export class CustomerRepository {
    static getClient(overrideClient) {
        return overrideClient ?? getAdminSupabaseClient();
    }
    static async createCustomerAtomic(params, _overrideClient) {
        const addressJson = params.address
            ? JSON.stringify({
                village: params.address.village || 'Village',
                hamlet_area: params.address.hamletArea || null,
                taluka_subdistrict: params.address.talukaSubdistrict || 'Taluka',
                district: params.address.district || 'District',
                state: params.address.state || 'Maharashtra',
                postal_code: params.address.postalCode || '416001',
            })
            : null;
        try {
            const res = await query(`SELECT public.register_customer($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10) AS customer;`, [
                params.organizationId,
                params.primaryCenterId,
                params.farmerCode || null,
                params.fullName.trim(),
                params.normalizedMobileNumber.trim(),
                params.permittedCategories,
                params.registeredBy,
                params.deviceId || 'BACKEND_API',
                addressJson,
                null,
            ]);
            const created = res.rows[0].customer;
            const customerId = created.id;
            if (params.bankName || params.bankAccountNumber || params.bankIfscCode || params.bankAccountHolderName) {
                await query(`UPDATE customers 
           SET bank_name = $1, bank_account_number = $2, bank_ifsc_code = $3, bank_account_holder_name = $4 
           WHERE id = $5;`, [
                    params.bankName || null,
                    params.bankAccountNumber || null,
                    params.bankIfscCode || null,
                    params.bankAccountHolderName || null,
                    customerId,
                ]);
            }
            const fullProfile = await this.findById(customerId, params.organizationId);
            if (!fullProfile) {
                throw new AppError('Customer was created but could not be retrieved', 500);
            }
            return fullProfile;
        }
        catch (err) {
            const error = err;
            if (error.code === '23505') {
                throw new AppError(`Customer with mobile number ${params.normalizedMobileNumber} already exists in this organization`, 409, 'DUPLICATE_MOBILE_NUMBER');
            }
            throw err;
        }
    }
    static async getCustomerById(customerId, overrideClient) {
        const res = await query(`SELECT organization_id FROM customers WHERE id = $1;`, [customerId]);
        if (res.rows.length === 0)
            return null;
        return this.findById(customerId, res.rows[0].organization_id, overrideClient);
    }
    static async findById(customerId, organizationId, _overrideClient) {
        const res = await query(`SELECT c.id, c.organization_id, c.primary_center_id, c.farmer_code, c.full_name,
              c.normalized_mobile_number, c.status, c.registration_status, c.bank_name,
              c.bank_account_number, c.bank_ifsc_code, c.bank_account_holder_name,
              c.is_deleted, c.deleted_at, c.deletion_reason, c.created_at, c.updated_at,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'village', ca.village,
                  'hamletArea', ca.hamlet_area,
                  'talukaSubdistrict', ca.taluka_subdistrict,
                  'district', ca.district,
                  'state', ca.state,
                  'postalCode', ca.postal_code
                )) FROM customer_addresses ca WHERE ca.customer_id = c.id),
                '[]'::json
              ) as customer_addresses,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'milk_category', cmc.milk_category,
                  'is_authorized', cmc.is_authorized
                )) FROM customer_milk_categories cmc WHERE cmc.customer_id = c.id),
                '[]'::json
              ) as customer_milk_categories
       FROM customers c
       WHERE c.id = $1 AND c.organization_id = $2;`, [customerId, organizationId]);
        if (res.rows.length === 0)
            return null;
        return mapRowToProfile(res.rows[0]);
    }
    static async findAll(filter, overrideClient) {
        return this.listPaginated(filter, overrideClient);
    }
    static async listPaginated(filter, _overrideClient) {
        const params = [filter.organizationId];
        let where = 'WHERE c.organization_id = $1';
        if (filter.status === CustomerStatus.SOFT_DELETED || filter.status === 'SOFT_DELETED') {
            where += ' AND c.is_deleted = TRUE';
        }
        else {
            where += ' AND c.is_deleted = FALSE';
            if (filter.status) {
                params.push(filter.status);
                where += ` AND c.status = $${params.length}`;
            }
        }
        if (filter.centerId) {
            params.push(filter.centerId);
            where += ` AND c.primary_center_id = $${params.length}`;
        }
        if (filter.search) {
            params.push(`%${filter.search}%`);
            where += ` AND (c.full_name ILIKE $${params.length} OR c.normalized_mobile_number ILIKE $${params.length} OR c.farmer_code ILIKE $${params.length})`;
        }
        const countRes = await query(`SELECT COUNT(*) as total FROM customers c ${where};`, params);
        const total = parseInt(countRes.rows[0].total, 10);
        const page = Math.max(1, Number(filter.page) || 1);
        const limit = Math.max(1, Number(filter.limit) || 20);
        const offset = (page - 1) * limit;
        params.push(limit, offset);
        const sortCol = filter.sortBy === 'farmer_code'
            ? 'c.farmer_code'
            : filter.sortBy === 'full_name'
                ? 'c.full_name'
                : 'c.created_at';
        const sortDir = (filter.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        const listRes = await query(`SELECT c.id, c.organization_id, c.primary_center_id, c.farmer_code, c.full_name,
              c.normalized_mobile_number, c.status, c.registration_status, c.bank_name,
              c.bank_account_number, c.bank_ifsc_code, c.bank_account_holder_name,
              c.is_deleted, c.deleted_at, c.deletion_reason, c.created_at, c.updated_at,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'village', ca.village,
                  'hamletArea', ca.hamlet_area,
                  'talukaSubdistrict', ca.taluka_subdistrict,
                  'district', ca.district,
                  'state', ca.state,
                  'postalCode', ca.postal_code
                )) FROM customer_addresses ca WHERE ca.customer_id = c.id),
                '[]'::json
              ) as customer_addresses,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'milk_category', cmc.milk_category,
                  'is_authorized', cmc.is_authorized
                )) FROM customer_milk_categories cmc WHERE cmc.customer_id = c.id),
                '[]'::json
              ) as customer_milk_categories
       FROM customers c
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${params.length - 1} OFFSET $${params.length};`, params);
        const items = listRes.rows.map(r => mapRowToProfile(r));
        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }
    static async update(customerId, organizationId, params, updatedBy, _overrideClient) {
        if (params.fullName) {
            await query(`UPDATE customers SET full_name = $1, updated_at = NOW(), version = version + 1 WHERE id = $2 AND organization_id = $3;`, [params.fullName.trim(), customerId, organizationId]);
        }
        if (params.address) {
            const a = params.address;
            await query(`INSERT INTO customer_addresses (customer_id, village, hamlet_area, taluka_subdistrict, district, state, postal_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (customer_id) 
         DO UPDATE SET village = EXCLUDED.village, hamlet_area = EXCLUDED.hamlet_area,
                       taluka_subdistrict = EXCLUDED.taluka_subdistrict, district = EXCLUDED.district,
                       state = EXCLUDED.state, postal_code = EXCLUDED.postal_code, updated_at = NOW();`, [
                customerId,
                a.village || 'Village',
                a.hamletArea || null,
                a.talukaSubdistrict || 'Taluka',
                a.district || 'District',
                a.state || 'Maharashtra',
                a.postalCode || '416001',
            ]);
        }
        if (params.permittedCategories && params.permittedCategories.length > 0) {
            await query(`UPDATE customer_milk_categories SET is_authorized = FALSE WHERE customer_id = $1;`, [customerId]);
            for (const cat of params.permittedCategories) {
                await query(`INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_at, authorized_by)
           VALUES ($1, $2, TRUE, NOW(), $3)
           ON CONFLICT (customer_id, milk_category) 
           DO UPDATE SET is_authorized = TRUE, authorized_at = NOW(), authorized_by = $3;`, [customerId, cat, updatedBy]);
            }
        }
        const updated = await this.findById(customerId, organizationId);
        return updated;
    }
    static async softDeleteAtomic(customerId, organizationId, deletedBy, reason, _overrideClient) {
        await query(`SELECT public.soft_delete_customer($1, $2, $3, $4);`, [
            customerId,
            organizationId,
            deletedBy,
            reason,
        ]);
        const updated = await this.findById(customerId, organizationId);
        return updated;
    }
    static async restoreAtomic(customerId, organizationId, restoredBy, reason, _overrideClient) {
        await query(`SELECT public.restore_customer($1, $2, $3, $4);`, [
            customerId,
            organizationId,
            restoredBy,
            reason,
        ]);
        const updated = await this.findById(customerId, organizationId);
        return updated;
    }
}
//# sourceMappingURL=customer.repository.js.map