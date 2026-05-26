# ADR 0004: Local Security Boundary

## Status

Accepted

## Context

codex-app-web controls local Codex app-server workflows involving terminal,
filesystem, approval, upload, auth, and WebSocket traffic. A permissive network
default would expose sensitive local operations beyond the intended developer
machine.

## Decision

The app defaults to a loopback-only security boundary. LAN exposure is an
explicit development opt-in and production use requires intentional host, origin,
and token configuration.

## Consequences

- Default `UI_HOST`, backend WebSocket, allowed hosts, and allowed origins remain
  loopback-scoped.
- The server requires local auth for configuration, uploads, and WebSocket
  control surfaces.
- Upload, CSP, payload, origin, host, and token checks are part of the protected
  boundary and must not be weakened without threat-model and test updates.
