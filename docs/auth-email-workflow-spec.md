# Auth Email Workflow Spec

## Objetivo

Extract verification and password-recovery email workflows from `AuthService`
into a dedicated service without changing observable auth API behavior.

## Alcance

This vertical owns:

- email verification token consumption
- resend verification workflow
- forgot-password workflow
- reset-token verification
- password reset with token
- email resend rate limiting

## No objetivos

- registration transaction
- login/session issuance
- MFA setup flow
- logout

## Invariantes

- unknown emails remain non-enumerable in resend/forgot-password flows
- email rate limit remains enforced at 90 seconds
- verification and reset tokens still expire as before
- token persistence still happens before sending emails

## Criterios de aceptación

- `AuthService` delegates email/token workflows to a dedicated service
- controller-visible responses remain unchanged
- targeted email-workflow specs pass
- existing `AuthService` specs continue to pass
