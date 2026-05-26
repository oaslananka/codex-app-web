# ADR 0003: Release Artifact Model

## Status

Accepted

## Context

The project is distributed from GitHub Releases rather than npm, container
registries, or static hosting. Release consumers need verifiable package
contents and supply-chain evidence.

## Decision

GitHub Releases are the guarded public artifact surface. Release automation
publishes the package tarball, CycloneDX SBOM, SHA256 checksums, and GitHub
artifact provenance for each created release.

## Consequences

- `pnpm release:state` must continue to report GitHub Release as the configured
  guarded target.
- The release workflow validates source, builds the package, generates SBOM
  evidence, attests the tarball, and verifies release assets.
- Package, registry, container, or deployment releases require a new ADR before
  becoming canonical.
