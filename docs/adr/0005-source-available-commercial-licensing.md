# ADR-0005 - Source-Available and Commercial Licensing

**Status:** Accepted

**Date:** 2026-09-15

## Context

codex-app-web was previously published under the MIT License, which permits unrestricted commercial reuse. The project now wants to remain publicly inspectable and available for noncommercial use while reserving commercial use of new project-authored revisions for separately negotiated licensing.

Previously published MIT revisions cannot be retroactively withdrawn. Third-party material and generated upstream OpenAI Codex artifacts keep their own terms.

## Decision

Current project-authored source is licensed under PolyForm Noncommercial 1.0.0. Commercial use requires a separate written commercial license. Earlier revisions already published under MIT remain usable under their original MIT terms.

Generated OpenAI Codex app-server protocol artifacts remain Apache-2.0 under their nested REUSE metadata. Non-trivial external code contributions require DCO sign-off and a reviewed CLA before merge.

## Consequences

- Describe current project-authored code as source-available, not OSI-approved open source.
- Keep package metadata, README, runtime metadata, REUSE declarations, and release surfaces aligned.
- Preserve third-party and upstream notices and licenses independently.
- Treat the CLA template as requiring legal review before operational adoption.
