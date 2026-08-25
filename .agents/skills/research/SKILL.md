---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Use a Codex collaboration agent when research is independent from the parent task. Give it a bounded question, source limits, and a write location.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repository keeps such notes. Ask before a new location is created.

Use Luna low for source inventory. Use Terra medium for evidence synthesis. Do not read `.env`, include secrets, use production accounts, or make external changes.
