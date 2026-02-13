const otplib = require('otplib');
console.log('otplib exports:', Object.keys(otplib));
if (otplib.authenticator) {
    console.log('authenticator exists');
} else {
    console.log('authenticator MISSING');
}
try {
    const { authenticator } = require('otplib');
    console.log('Require destructuring:', !!authenticator);
} catch (e) {
    console.log('Require failed');
}
