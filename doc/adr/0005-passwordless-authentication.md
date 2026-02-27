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
- **Session Jacking**: If an email account is compromised, the app account is compromised (mitigated by MFA, which is the next step).

## Compliance

This decision aligns with the requirement to modernize the platform and fix the reported "incorrect password" security ambiguity.
