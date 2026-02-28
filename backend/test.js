const { TOTP, NobleCryptoPlugin, ScureBase32Plugin } = require('otplib');
const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
async function test() {
  const secret = totp.generateSecret();
  const token = await totp.generate({ secret });
  const result = await totp.verify(token, { secret });
  console.log("RESULT IS:", result);
}
test().catch(console.error);
