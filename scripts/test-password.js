/**
 * Test password hashing
 */

const bcrypt = require('bcryptjs');

async function test() {
  const password = 'teszt1234';
  const hash = await bcrypt.hash(password, 10);
  console.log('Hash:', hash);
  
  const isValid = await bcrypt.compare(password, hash);
  console.log('Is valid:', isValid);
}

test();
