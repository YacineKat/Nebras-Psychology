require('dotenv').config();
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET not found in .env');
  process.exit(1);
}
const token = jwt.sign({ id: 1, userType: 'admin' }, secret, { expiresIn: '12h' });
console.log(token);
