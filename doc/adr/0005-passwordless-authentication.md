# 5. Passwordless Authentication

Date: 2026-02-18 [Supersedes ADR 0003]

## Status

Accepted

## Context

The application initially used password-based authentication. However, this presented security challenges, such as:
1.  **Password Management**: Storing and securing passwords requires strict hashing and salt management (Argon2 was used).
2.  **User Experience**: Users are prone to forgetting passwords, leading to friction (reset flows).
3.  **Security Risks**: Phishing, credential stuffing, and weak passwords are common vectors.
4.  **Enumeration**: The login error messages could potentially reveal if an email exists (though mitigations were attempted).

The user explicitly requested a "Magic Link" system to modernize the application and improve security.

## Decision

We will replace the password-based authentication system with **Passwordless Login (Magic Links)**.

### Technical Details

1.  **Frontend**:
    - Remove the password field from the Login form.
    - Submit only the email address.
    - Handle a callback route (`/auth/callback`) to capture the JWT token from the magic link.

2.  **Backend**:
    - **Endpoint**: `POST /auth/magic-link` generates a short-lived, single-use JWT.
    - **Delivery**: Send an email via `EmailService` (using Mailpit for dev) containing the link.
    - **Verification**: `POST /auth/login-magic` validates the token.
    - **User Creation**: If the email doesn't exist, a new user is created instantly (Just-In-Time provisioning) with a random, unused password to satisfy the database schema constraints.

3.  **Database**:
    - Retain the `password` column in the `User` table for now to avoid schema migrations, but fill it with high-entropy random garbage for new users.

4.  **Email Security**:
    - **Blocklist**: To prevent abuse and enforce user quality, we implemented a **Domain Blocklist** for registration.
    - **Why**: Using disposable emails (e.g., `yopmail.com`, `temp-mail.org`) bypasses the intent of user verification.
    - **Mechanism**: The backend checks the email domain against a curated list of known disposable providers before sending the magic link.

## Consequences

### Positive
- **Improved Security**: Eliminates password-related attacks (brute force, weak passwords).
- **Simpler UX**: No need to remember passwords.
- **Reduced Maintenance**: No password reset logic needed.
- **Quality Users**: Analyzing the user base is more reliable without disposable accounts.

### Negative
- **Email Dependency**: Access to email is strictly required to log in.
- **Expired Links Support**: Explicit magic link expiration rules (e.g., 15 minutes) may lead to increased support requests for expired links.
- **Session Jacking Risk**: If an email account is compromised, the app account is potentially exposed (mitigated significantly by deploying MFA/TOTP workflows alongside magic links).

## Mitigations & Workflow Enhancements

### JWT Validity & JTI
Magic Links must enforce an explicit expiration time of 15 minutes. To ensure magic links are strictly single-use, the system implements a `jti` (JWT ID) checking process mapped against `User.verificationToken` stored on the user record for single-use validation, invalidating the link immediately post-consumption.

### JIT Provisioning Security
Just-In-Time (JIT) provisioning happens upon magic link generation. To prevent spam abuse and rapid database bloat, the `POST /auth/magic-link` endpoint is protected by rate limiting (`@Throttle`), restricting generation frequency per IP/email. 

### Disposable Domains
The disposable domain blocklist strategy is expanded to prevent temporary emails from polluting the initial JIT phase, ensuring user base integrity and safely blocking fast-rotating inbox services from abusing free accounts.

### Two-Step Link Flow
Email security scanners (like enterprise firewalls) often automatically visit URLs found in emails, inadvertently consuming single-use tokens. To prevent this, the magic link lands on a frontend verification barrier page (two-step flow) where the user must explicitly click a button to finalize the login.

## Migration & Rollback Strategy
- **Phase 1**: Both password logins and magic links act in parallel while users are funneled into transitioning. The `User.password` column is retained.
- **Phase 2**: `POST /auth/login` password checks are deprecated. JIT provisioning relies exclusively on token logic.
- **Rollback Plan**: In the event of catastrophic email API failure (e.g., SendGrid/Mailtrap outage), business continuity can be ensured by temporarily switching to one of the following options via configuration toggles:
  - **Administrator-Generated Temporary Passwords**: Administrators can issue short-lived temporary passwords applied directly to user accounts. This emergency fallback must strictly adhere to the following secure delivery and operational protocols:
    - *Secure Delivery Channels (in order of preference)*:
      1. **Secure Admin Portal** (*Planned Roadmap*): Users retrieve a one-time password digitally after confirming multi-factor authentication.
      2. **SMS with OTP** (*Planned Roadmap*): A system-generated text message containing the recovery password is sent to the registered mobile number.
      3. **Voice Call Verification** (*Planned Roadmap*): An automated voice call dictates the temporary password.
      4. **Support-Assisted Phone Verification** (*Planned - Blocker*): Manual verification where customer support performs strict identity checks before securely relaying the temporary password.
    - *Required Safeguards*:
      - **Short TTL** (*Planned - Blocker*): Temporary passwords must expire quickly (e.g., within 15 to 30 minutes of issuance).
      - **Forced Reset** (*Planned - Blocker*): Users must be forced to set a new password or re-authenticate via Magic Link immediately upon their first successful login.
      - **Audit Trail** (*Implemented*): Every issuance of a temporary password must be rigidly logged, including the timestamp, the administrator responsible, and the channel used.
      - **Admin Authorization** (*Implemented*): Only administrators with explicitly elevated Privileged Access Management (PAM) roles can trigger the generation of these passwords.
      - **Note:** All items marked "Planned" in this safeguards list must be completed before any delivery channel can be considered production-ready.
    - *Operational Steps*:
      - Only authorized administrators or automated Tier-1 support workflows can trigger this process.
      - The user initiates the request via the fallback recovery portal.
      - The system escalates directly to Support-Assisted Phone Verification until automated channels are built.
    - *Technical Note on JIT Users*: Admin temporary passwords are written to the user's password hash field (overwriting the garbage) *only* for the duration of the short TTL. The system records this in the Audit Trail and sets a flag (`temporary_password_active`) so auth logic (legacy `LoginDto` endpoints) temporarily accepts the credential while continuing to treat JIT users as passwordless by default. Upon first login with the temp password, the user is forced to (a) set a new persistent password, enabling legacy authentication for that account, or (b) re-link via Magic Link. JIT users remain passwordless unless an admin explicitly overwrites the password hash with a temporary one.

  - **Re-enabling Retained User Password Authentication / Legacy `LoginDto` endpoints**: This applies *only* to users who migrated from the prior password-based system and still have an accessible password hash.
  - *Constraint*: JIT-provisioned users (those created via Magic Links who received high-entropy, inaccessible passwords securely buried in the DB) will NOT have their access restored via legacy password endpoints. Those users will strictly rely on administrator-generated temp passwords while the email infrastructure is recovering.

  - **Self-Service Recovery Mitigation (Optional)**: A post-magic-link "set recovery password" flow is proposed so JIT users can optionally create a fallback password after their first successful Magic Link authentication. 
    - *Behavioral Changes*: After successful Magic Link login, the system marks the user as JIT-provisioned but prompts them to set a recovery password. If accepted, a boolean flag `recovery_password_set` is persisted, allowing the legacy `LoginDto` password path for fallback. If users decline, their fallback mechanism strictly remains administrator-generated temp passwords.

## Compliance

This decision aligns with the requirement to modernize the platform and fix the reported "incorrect password" security ambiguity, adopting ASVS compliant session practices.
