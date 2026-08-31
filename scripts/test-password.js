/**
 * Test password hashing
 */

const bcrypt = require('bcryptjs');

async function test() {
  const password = process.env.TEST_PASSWORD;
  if (!password) throw new Error('TEST_PASSWORD is required.');
  const hash = await bcrypt.hash(password, 10);
  console.log('Hash:', hash);
  
  const isValid = await bcrypt.compare(password, hash);
  console.log('Is valid:', isValid);
}

test();
