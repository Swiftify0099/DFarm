-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 001: EXTENSIONS AND COMMON DATABASE OBJECTS
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Common Updated_At Trigger Function
-- Uses SET search_path = pg_catalog and fully schema-qualified pg_catalog references for tamper resistance.
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.trigger_set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trigger_set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_set_updated_at() TO authenticated, anon, service_role;

-- 3. Tenant Claims Extractor Functions (Residing strictly in public schema)
-- Native Supabase auth.uid() is untouched and provided by GoTrue.
-- All custom functions use SET search_path = pg_catalog to prevent Trojan/search-path vulnerabilities.

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid AS $$
DECLARE
  claims_text text;
BEGIN
  claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
  IF claims_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (NULLIF(claims_text::jsonb -> 'app_metadata' ->> 'organization_id', ''))::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.current_org_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.current_center_id()
RETURNS uuid AS $$
DECLARE
  claims_text text;
BEGIN
  claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
  IF claims_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (NULLIF(claims_text::jsonb -> 'app_metadata' ->> 'center_id', ''))::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.current_center_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_center_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_center_id() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
DECLARE
  claims_text text;
BEGIN
  claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
  IF claims_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN claims_text::jsonb -> 'app_metadata' ->> 'user_role';
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.current_user_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid AS $$
DECLARE
  claims_text text;
BEGIN
  claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
  IF claims_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (NULLIF(claims_text::jsonb -> 'app_metadata' ->> 'customer_id', ''))::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.current_customer_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_customer_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_customer_id() TO authenticated, anon, service_role;
