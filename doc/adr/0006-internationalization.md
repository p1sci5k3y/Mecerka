# 6. Internationalization Strategy

Date: 2026-02-19

## Status

Accepted

## Context

The platform requires multi-language support to cater to a diverse user base (Clients, Providers, Runners). We need a scalable and performant solution that integrates seamlessly with Next.js App Router (v14+).

## Decision

We will use **`next-intl`** for internationalization.

### Rationale

1.  **App Router Support**: `next-intl` is designed specifically for the Server Components architecture of Next.js App Router, allowing for efficient server-side translation rendering.
2.  **Type Safety**: It offers excellent TypeScript support, reducing runtime errors due to missing keys.
3.  **Standard JSON**: Uses standard JSON files for locale messages, which are easy to manage and can be integrated with external translation management systems if needed.
4.  **Middleware Support**: Built-in middleware for locale detection and routing (e.g., `/es/dashboard`, `/en/dashboard`).

## Implementation Details

-   **Routing**: We will adopt a sub-path routing strategy (e.g., `/[locale]/...`).
-   **Default Locale**: Spanish (`es`).
-   **Supported Locales**: Spanish (`es`), English (`en`).
-   **Storage**: Translations will be stored in `messages/{locale}.json`.
-   **Client/Server**: We will use `useTranslations` for Client Components and `getTranslations` for Server Components.

## Consequences

-   **Structure Change**: The `app` directory structure will need to be refactored to include a `[locale]` dynamic segment at the root.
-   **Development Overhead**: All text content must be extracted to JSON files, adding a slight overhead during development but ensuring maintainability.
