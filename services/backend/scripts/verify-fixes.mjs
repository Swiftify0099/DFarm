async function runVerification() {
  console.log('=== 1. VERIFY DAIRY DIRECTORY API ===');
  const dirRes = await fetch('http://localhost:4000/api/v1/dairies');
  const dirData = await dirRes.json();
  console.log('GET /dairies Status:', dirRes.status, 'Total count:', dirData.count);
  const warnaInList = dirData.data.find(d => d.name.toLowerCase().includes('warna'));
  console.log('Warna Milk in List:', warnaInList ? { 
    id: warnaInList.id, 
    code: warnaInList.code, 
    name: warnaInList.name, 
    admin: warnaInList.primaryAdminName, 
    mobile: warnaInList.primaryAdminMobile, 
    status: warnaInList.status,
    provisioningStatus: warnaInList.provisioningStatus 
  } : 'NOT FOUND');

  console.log('\n=== 2. VERIFY SEARCH FILTER ===');
  const searchRes = await fetch('http://localhost:4000/api/v1/dairies?search=Warna');
  const searchData = await searchRes.json();
  console.log('GET /dairies?search=Warna Status:', searchRes.status, 'Count:', searchData.count, 'Matches:', searchData.data.map(d => d.name));

  console.log('\n=== 3. VERIFY DUPLICATE DAIRY CREATION ===');
  const dupRes = await fetch('http://localhost:4000/api/v1/dairies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: "Warna Milk's",
      businessPhone: '9834388787',
      businessEmail: 'pankajye5656@gmail.com',
      addressLine1: 'Kavathe Piran',
      district: 'sangli',
      state: 'Maharashtra',
      pincode: '416417',
      primaryAdminName: 'popat yewale',
      primaryAdminMobile: '9834388787'
    })
  });
  const dupData = await dupRes.json();
  console.log('Duplicate POST /dairies Status:', dupRes.status);
  console.log('Response body:', JSON.stringify(dupData, null, 2));

  console.log('\n=== 4. VERIFY ADMIN OTP FLOW FOR 9834388787 (POPAT YEWALE) ===');
  const reqRes1 = await fetch('http://localhost:4000/api/v1/auth/admin/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobileNumber: '9834388787' })
  });
  const reqData1 = await reqRes1.json();
  console.log('OTP Request 9834388787:', reqRes1.status, reqData1);
  const otp1 = reqData1.previewOtp;

  const verRes1 = await fetch('http://localhost:4000/api/v1/auth/admin/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobileNumber: '9834388787', otp: otp1 })
  });
  const verData1 = await verRes1.json();
  console.log('OTP Verify 9834388787 Status:', verRes1.status);
  console.log('User Object:', JSON.stringify(verData1.user, null, 2));
  console.log('Token Present:', Boolean(verData1.token));

  console.log('\n=== 5. VERIFY ADMIN OTP FLOW FOR 7507495615 (WARNA DAIRY ADMIN) ===');
  const reqRes2 = await fetch('http://localhost:4000/api/v1/auth/admin/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobileNumber: '7507495615' })
  });
  const reqData2 = await reqRes2.json();
  console.log('OTP Request 7507495615:', reqRes2.status, reqData2);
  const otp2 = reqData2.previewOtp;

  const verRes2 = await fetch('http://localhost:4000/api/v1/auth/admin/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobileNumber: '7507495615', otp: otp2 })
  });
  const verData2 = await verRes2.json();
  console.log('OTP Verify 7507495615 Status:', verRes2.status);
  console.log('User Object:', JSON.stringify(verData2.user, null, 2));
  console.log('Token Present:', Boolean(verData2.token));
}

runVerification();
