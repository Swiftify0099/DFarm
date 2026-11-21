-- ==============================================================================
-- DFARM - SMART DAIRY MULTI-TENANT ARCHITECTURE
-- QUARANTINED MIGRATION: 031_remove_dairy_admin_7507495615.sql
-- TARGET: MANUAL_REVIEW_REQUIRED
-- ==============================================================================
-- NOTICE: This script has been quarantined because it performs a destructive 
-- deletion of administrative user records (+917507495615).
-- Production policy mandates that destructive deletions require explicit Super Admin 
-- manual review and sign-off.
-- This file is skipped by automated migration runners.

DO $$
BEGIN
  RAISE NOTICE 'Quarantined migration 031_remove_dairy_admin_7507495615.sql requires manual review.';
END $$;
