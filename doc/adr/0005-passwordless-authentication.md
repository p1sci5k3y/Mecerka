# 5. Passwordless Authentication

Date: 2026-02-18 [Supersedes ADR 0003]

## Status

Superseded by implementation

## Context

The application initially used password-based authentication. However, this presented security challenges, such as:
1.  **Password Management**: Storing and securing passwords requires strict hashing and salt management (Argon2 was used).
2.  **User Experience**: Users are prone to forgetting passwords, leading to friction (reset flows).
3.  **Security Risks**: Phishing, credential stuffing, and weak passwords are common vectors.
4.  **Enumeration**: The login error messages could potentially reveal if an email exists (though mitigations were attempted).

The user explicitly requested a "Magic Link" system to modernize the application and improve security.

During implementation and security validation, the team concluded that removing the password entirely would weaken the desired two-factor model for the MVP. The final implemented authentication flow preserves:

- **knowledge factor**: password
- **possession factor**: MFA/TOTP

This keeps the operational login aligned with the current frontend, backend and security controls already implemented in the repository.

## Decision

We evaluated replacing the password-based authentication system with **Passwordless Login (Magic Links)**, but the implemented system retains **password + MFA** as the primary authentication flow.

### Technical Details

1.  **Frontend (implemented)**:
    - Keep the password field in the Login form.
    - Keep the standard login flow based on email + password.
    - Route users through MFA completion when required.

2.  **Backend (implemented)**:
    - `POST /auth/register` creates users with hashed passwords.
    - `POST /auth/login` authenticates email + password.
    - Email verification remains part of the activation flow.
    - MFA/TOTP remains available and enforced on sensitive flows.

3.  **Database (implemented)**:
    - Retain and use the `password` column as an active part of authentication.
    - Retain MFA-related fields and verification tokens already present in the user model.

4.  **Email Security (implemented)**:
    - Email remains required for verification and recovery flows.
    - The system uses the existing verification and reset-token logic instead of passwordless login links.

## Consequences

### Positive
- **Two-Factor Integrity**: Authentication keeps a knowledge factor and a possession factor.
- **Implementation Alignment**: The ADR now matches the deployed frontend and backend.
- **Operational Stability**: The login flow does not depend on passwordless email delivery to function.

### Negative
- **Password Lifecycle Still Exists**: Password reset, storage and brute-force concerns remain relevant.
- **UX Friction**: The flow is less frictionless than a pure magic-link approach.

## Mitigations & Workflow Enhancements

### Password + MFA Security
- Passwords remain hashed with Argon2.
- MFA/TOTP remains the possession factor for sensitive operations.
- Verification, reset and throttling controls continue to protect the auth surface.

## Migration & Rollback Strategy
- The passwordless path was not promoted to the implemented authentication model.
- The operational path remains password + MFA.
- Any future passwordless experiment would require a new ADR or an explicit revision of this one based on the implemented code.

## Compliance

The implemented decision aligns with the requirement to keep a strong authentication model while preserving MFA as a real second factor in the deployed MVP.
