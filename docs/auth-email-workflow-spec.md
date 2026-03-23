# Auth Email Workflow Spec

## Goal

Extract verification and password-recovery email workflows from `AuthService`
into a dedicated service without changing observable auth API behavior.

## Scope

This vertical owns:

- email verification token consumption
- resend verification workflow
- forgot-password workflow
- reset-token verification
- password reset with token
- email resend rate limiting

## Non-goals

- registration transaction
- login/session issuance
- MFA setup flow
- logout

## Invariants

- unknown emails remain non-enumerable in resend/forgot-password flows
- email rate limit remains enforced at 90 seconds
- verification and reset tokens still expire as before
- token persistence still happens before sending emails

## Acceptance criteria

- `AuthService` delegates email/token workflows to a dedicated service
- controller-visible responses remain unchanged
- targeted email-workflow specs pass
- existing `AuthService` specs continue to pass
