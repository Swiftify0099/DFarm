import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function main() {
  await client.connect();
  await client.query(`
    CREATE OR REPLACE FUNCTION public.current_org_id()
    RETURNS uuid AS $$
    DECLARE
      claims_text text;
      c jsonb;
    BEGIN
      claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
      IF claims_text IS NULL THEN
        RETURN NULL;
      END IF;
      c := claims_text::jsonb;
      RETURN COALESCE(
        (NULLIF(c -> 'app_metadata' ->> 'organization_id', ''))::uuid,
        (NULLIF(c ->> 'organization_id', ''))::uuid,
        (NULLIF(c ->> 'organizationId', ''))::uuid
      );
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog;

    CREATE OR REPLACE FUNCTION public.current_user_role()
    RETURNS text AS $$
    DECLARE
      claims_text text;
      c jsonb;
    BEGIN
      claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
      IF claims_text IS NULL THEN
        RETURN NULL;
      END IF;
      c := claims_text::jsonb;
      RETURN COALESCE(
        c -> 'app_metadata' ->> 'user_role',
        c ->> 'user_role',
        c ->> 'role'
      );
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog;

    CREATE OR REPLACE FUNCTION public.current_center_id()
    RETURNS uuid AS $$
    DECLARE
      claims_text text;
      c jsonb;
    BEGIN
      claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
      IF claims_text IS NULL THEN
        RETURN NULL;
      END IF;
      c := claims_text::jsonb;
      RETURN COALESCE(
        (NULLIF(c -> 'app_metadata' ->> 'center_id', ''))::uuid,
        (NULLIF(c ->> 'center_id', ''))::uuid,
        (NULLIF(c ->> 'primaryCenterId', ''))::uuid
      );
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog;
  `);

  console.log('RLS extractor functions updated successfully');
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

