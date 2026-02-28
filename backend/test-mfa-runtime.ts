import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

export const totp = new TOTP({
  digits: 6,
  period: 30,
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

export async function run() {
  try {
    const secret = totp.generateSecret();
    const token = await totp.generate({ secret });
    const result = await totp.verify(token, { secret });
    console.log('Result type:', typeof result);
    console.log('Result value:', result);

    // Assert the result boolean explicitly
    if ((result as any) !== true) {
      throw new Error(`MFA verification failed. Expected true, got ${result}`);
    }
  } catch (e) {
    console.error('MFA run failed', e);
    process.exit(1);
  }
}

if (require.main === module) {
  run().catch(e => {
    console.error('Unhandled promise rejection:', e);
    process.exit(1);
  });
}
