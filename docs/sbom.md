# Seguridad De La Cadena De Suministro De Software

## Propósito

The security posture of the system depends not only on the application code, but also on the third-party components pulled through the npm ecosystem.

To improve traceability and auditability, the repository supports generation of an **SBOM (Software Bill of Materials)**.

## Estrategia de gestión de dependencias

The project uses npm-based dependency management with lockfiles (`package-lock.json`), which provides:

- deterministic dependency resolution;
- reproducible installations;
- stable CI behavior across environments.

In a monorepo context, lockfiles are important because they reduce uncontrolled drift between developer machines and automated pipelines.

## Qué es un SBOM

An SBOM is a machine-readable inventory of software components included in a build or repository state.

Its value is practical:

- identify dependency versions;
- support vulnerability tracking;
- improve compliance and auditability;
- accelerate incident response when a third-party package is disclosed as vulnerable.

## Implementación de CycloneDX

The recommended SBOM format for this repository is **CycloneDX JSON**.

It can be generated with:

```bash
npx @cyclonedx/cyclonedx-npm --output-file sbom.json
```

This produces a JSON SBOM that can include:

- direct and transitive dependencies;
- versions;
- package identifiers;
- licenses;
- hashes or related metadata when available from the package ecosystem.

## Recomendación para el monorepo

Because the repository contains multiple Node.js workspaces, the practical recommendation is to generate SBOMs per lockfile boundary when needed, for example:

- repository root
- backend
- frontend

This avoids flattening unrelated component trees into a single ambiguous artifact.

## Integración con workflows

SBOM generation can be used:

- locally, before a release or audit;
- in CI, as a generated artifact for each build;
- during security review, to feed SCA tooling.

Typical downstream uses:

- vulnerability scanning;
- compliance review;
- software inventory tracking;
- incident response after upstream package disclosures.

## Posicionamiento

An SBOM does **not** replace:

- code review;
- dependency updates;
- patch management;
- continuous security monitoring.

It complements tooling such as:

- Trivy
- Dependabot
- Snyk
- other SCA scanners

## Limitación

SBOM reflects dependencies at generation time and does not replace continuous vulnerability monitoring.
