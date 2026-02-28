const { TOTP, NobleCryptoPlugin, ScureBase32Plugin } = require('otplib');

const totp = new TOTP({
  digits: 6,
  period: 30,
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

async function run() {
  const secret = totp.generateSecret();
  const token = await totp.generate(secret);
  const result = await totp.verify({ token, secret });
  console.log('Result type:', typeof result);
  console.log('Result value:', result);

  const invalidResult = await totp.verify({ token: '000000', secret });
  console.log('Invalid Result value:', invalidResult);
}

(async () => {
  try {
    await run();
  } catch (error) {
    console.error("error details:", error);
    process.exit(1);
  }
})();
