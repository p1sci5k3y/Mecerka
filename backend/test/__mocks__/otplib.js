module.exports = {
    TOTP: class TOTP {
        generate() { return '123456'; }
        check() { return true; }
        verify() { return true; }
    },
    NobleCryptoPlugin: class { setup() { } },
    ScureBase32Plugin: class { setup() { } }
};
