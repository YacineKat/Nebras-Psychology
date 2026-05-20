require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
(async () => {
  const token = process.env.TEST_ADMIN_JWT || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlclR5cGUiOiJhZG1pbiIsImlhdCI6MTc3OTEwNDc1NSwiZXhwIjoxNzc5MTQ3OTU1fQ.t5ZLHtzqu4z82Z177CFkql1DuMrUz7TXwhiX14Q98qk';
  const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
  const url = `${SERVER_URL}/api/admin/settings`;
  const payload = {
    siteName: 'TestSiteFromScript',
    contactEmail: 'adminscript@test.local',
    phone: '+213123456789',
    consultationPrice: 1500,
    vipMonthlyPrice: 6000,
    platformCommission: 12
  };
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch (e) {
    console.error('Request failed:', e);
  }
})();
