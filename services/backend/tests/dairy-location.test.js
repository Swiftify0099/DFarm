import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../dist/app.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';

describe('Super Admin Dairy Location & Coordinates API Test Suite', () => {
  let server;
  let baseUrl;
  const tokenService = new HmacJwtTokenService();
  const superAdminToken = tokenService.signToken({
    userId: '11111111-1111-4111-a111-000000000099',
    role: 'SUPER_ADMIN',
    actorType: 'STAFF',
    fullName: 'Super Administrator',
  });

  it('setup backend test server', async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve(null);
      });
    });
  });

  it('should reject dairy creation with invalid latitude (> 90)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        name: 'Invalid Lat Dairy',
        latitude: 95.12345,
        longitude: 74.12345,
        pincode: '416312',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Latitude/);
  });

  it('should reject dairy creation with invalid longitude (> 180)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dairies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        name: 'Invalid Lng Dairy',
        latitude: 18.5204,
        longitude: 195.12345,
        pincode: '416312',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Longitude/);
  });

  let createdDairyId;
  it('should create a new dairy with real coordinates and reverse-geocoded address', async () => {
    const payload = {
      name: 'Sahyadri Sahakari Dudh Sanstha',
      businessPhone: '+919822334455',
      businessEmail: 'sahyadri@dairy.coop',
      addressLine1: 'Near Primary School, Belanki Road',
      villageLocality: 'Miraj Rural',
      city: 'Miraj',
      district: 'Sangli',
      state: 'Maharashtra',
      pincode: '416410',
      latitude: 16.8456721,
      longitude: 74.6478912,
      formattedAddress: 'Belanki Road, Miraj Rural, Sangli, Maharashtra 416410, India',
      placeId: 'ChIJMirajRuralSahyadri001',
      primaryAdminName: 'Ramesh Balaso Patil',
      primaryAdminMobile: '+919822334455',
    };

    const res = await fetch(`${baseUrl}/api/v1/dairies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.dairy.id);
    assert.equal(json.data.dairy.name, 'Sahyadri Sahakari Dudh Sanstha');
    assert.equal(json.data.dairy.location.latitude, 16.8456721);
    assert.equal(json.data.dairy.location.longitude, 74.6478912);
    assert.equal(json.data.dairy.location.district, 'Sangli');
    assert.equal(json.data.dairy.location.placeId, 'ChIJMirajRuralSahyadri001');

    createdDairyId = json.data.dairy.id;
  });

  it('should retrieve created dairy by ID with accurate location metadata', async () => {
    assert.ok(createdDairyId);
    const res = await fetch(`${baseUrl}/api/v1/dairies/${createdDairyId}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.id, createdDairyId);
    assert.equal(json.data.location.latitude, 16.8456721);
    assert.equal(json.data.location.longitude, 74.6478912);
    assert.equal(json.data.location.formattedAddress, 'Belanki Road, Miraj Rural, Sangli, Maharashtra 416410, India');
  });

  it('should update dairy location pin via PATCH /:id/location', async () => {
    assert.ok(createdDairyId);
    const res = await fetch(`${baseUrl}/api/v1/dairies/${createdDairyId}/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        latitude: 16.8501234,
        longitude: 74.6512345,
        formattedAddress: 'Updated Pin Location, Miraj Rural, Maharashtra 416410',
        placeId: 'ChIJMirajRuralUpdated002',
      }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.location.latitude, 16.8501234);
    assert.equal(json.location.longitude, 74.6512345);
  });

  it('should perform proximity search with real coordinates via GET /api/v1/dairies/nearby', async () => {
    // Proximity to Miraj: lat 16.85, lng 74.65
    const res = await fetch(`${baseUrl}/api/v1/dairies/nearby?lat=16.85&lng=74.65`);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.length > 0);
  });

  it('teardown server', async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
