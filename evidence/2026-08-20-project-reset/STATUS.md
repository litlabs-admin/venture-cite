# Project reset status

## Scope

This work starts from executable code, tests, Git history, and read-only live evidence.

Existing Markdown files and code comments are not factual evidence until a check confirms them.

## Safety rules

- Protect real user data.
- Do not send test email.
- Do not print or commit secret values.
- Use isolated test accounts and tagged test data.
- Require approval before a deployment or a production write.

## Model limits

- Use Luna Low for file inventories.
- Use Terra Low or Medium for setup, code, tests, and documentation.
- Use Sol Medium for auth, billing, security, and database migration reviews.
- Do not use High effort without a new notice.

## Current phase

The setup phase is active on `codex/project-reset-setup`.

The repository contains 20 project skills, including `unslop`.

Two subagents adapted the imported skill instructions for Codex.

No live system change has occurred.

The Buffer MCP configuration now reads `BUFFER_MCP_TOKEN` from the Windows user environment.

The repository does not contain the Buffer token.

Five agent profiles now define Luna Low, Terra Low, Terra Medium, Sol Medium, and Spark Low work.

All 20 skills now have automatic invocation metadata and pinned source records.

The skill lock remains unchanged because its hash method is not available.

The stale Markdown scan found possible user data in 22 files.

Do not commit those files before a manual privacy review.

## Next checks

1. Commit the safe project setup files on the setup branch.
2. Preserve safe stale documents in a baseline commit.
3. Review risky stale documents for user data.
4. Start the fresh read-only code and live-system audit.
