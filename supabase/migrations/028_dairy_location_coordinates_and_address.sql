-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 028: DAIRY LOCATION COORDINATES AND ADDRESS PERSISTENCE
-- ==============================================================================

-- 1. Extend organizations table with geographical coordinates, place metadata, and contact
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)),
    ADD COLUMN IF NOT EXISTS formatted_address TEXT,
    ADD COLUMN IF NOT EXISTS place_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line1 TEXT,
    ADD COLUMN IF NOT EXISTS village_locality VARCHAR(100),
    ADD COLUMN IF NOT EXISTS city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS district VARCHAR(100),
    ADD COLUMN IF NOT EXISTS state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS business_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS business_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- 2. Extend dairy_centers table with spatial coordinates and place ID
ALTER TABLE dairy_centers
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)),
    ADD COLUMN IF NOT EXISTS formatted_address TEXT,
    ADD COLUMN IF NOT EXISTS place_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- 3. Create spatial indexes on coordinates for high-efficiency proximity and map bounding box queries
CREATE INDEX IF NOT EXISTS idx_organizations_geo 
ON organizations (latitude, longitude) 
WHERE (latitude IS NOT NULL AND longitude IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_dairy_centers_geo 
ON dairy_centers (latitude, longitude) 
WHERE (latitude IS NOT NULL AND longitude IS NOT NULL);

-- 4. Seed reference location coordinates for existing initial organization and center
UPDATE organizations
SET 
    latitude = 18.5204303,
    longitude = 73.8567437,
    formatted_address = 'DFarm Headquarters, Shivajinagar, Pune, Maharashtra 411005, India',
    place_id = 'ChIJx_806f_BwjsRwe74VnF6uQg',
    address_line1 = 'Shivajinagar',
    village_locality = 'Shivajinagar',
    city = 'Pune',
    district = 'Pune',
    state = 'Maharashtra',
    postal_code = '411005',
    country = 'India',
    business_phone = '+919822001122',
    business_email = 'contact@dfarm.in',
    location_updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND latitude IS NULL;

UPDATE dairy_centers
SET 
    latitude = 17.0378000,
    longitude = 74.5684000,
    formatted_address = 'Tasgaon Main Collection Unit, Station Road, Tasgaon, Sangli, Maharashtra 416312, India',
    place_id = 'ChIJS_TasgaonCollection01',
    country = 'India',
    location_updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000002'
  AND latitude IS NULL;
