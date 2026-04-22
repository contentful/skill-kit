---
name: contentful-help
description: Diagnose, configure, and look up Contentful topics. Trigger keywords: contentful help, contentful doctor, contentful setup
metadata:
  version: "1.0.0"
---

# contentful-help

This skill is a structured workflow driven by a compiled CLI binary. You interact with it
by calling the binary, reading its JSON output, following the instructions in the `prompt`
field, and passing your response back. **Do not show the raw JSON or Bash commands to the user.**

## How to run this skill

This SKILL.md file is inside the skill directory. Resolve the **absolute path** to `scripts/run`
from this file's location (e.g., `/path/to/skill/scripts/run`). Use the absolute path in all
Bash commands — do not `cd` into the skill directory.

In the examples below, `<skill>/scripts/run` is a placeholder for this absolute path.

### Detect your host

Determine which agent host you are running in, and pass it as `--host`:

- Claude Code: `--host claude-code`
- Codex: `--host codex`
- OpenCode: `--host opencode`
- Unknown/other: omit the flag (defaults to generic)

### Step 1: Start with a session

```bash
<skill>/scripts/run --context '{}' --host claude-code --session new
```

This returns a small JSON pointer:

```json
{ "sessionId": "abc123", "file": "/tmp/skill-kit-abc123.jsonl", "line": 2 }
```

Use the Read tool to read the session file at the returned line number (offset = line − 1, limit = 1).
The line contains the step prompt, schema, and preamble.

**Read the `preamble` first.** It defines verb-to-tool mappings (e.g., ASK_STRUCTURED, ASK_FREEFORM)
that prompts use throughout the skill. Follow these mappings for every step.

### Step 2: Follow the prompt

Read the `prompt` field from the session file line. It contains instructions — follow them.
The prompt may ask you to use specific tools, write files, analyze code, or interact with the user.
Produce a JSON object matching the `schema`.

### Step 3: Advance

Pass your output back with the step name:

```bash
<skill>/scripts/run advance --step <step-name> --output '<your-json>' --session abc123
```

This returns a line number (e.g., `4`). Read that line from the session file for the next prompt.

### Step 4: Repeat until done

Keep advancing until the line you read contains `"type":"done"`. The `finalOutput` field
contains the skill's result. Present it to the user.

### Important

- **Never show raw JSON output or Bash commands to the user.** The user sees your natural
  language responses, not the protocol.
- **If you get a validation error** (the response has `"error": "validation"` or `"type":"error"`),
  read the `message` field, fix your output, and retry the same step.

## Steps in this skill

- **choose**: (dynamic)
- **get-space**: Ask the user for their Contentful space ID, or detect it from CONTENTFUL_SPACE_ID in the environm...
- **ask-topic**: (dynamic)

## Sub-skills

This skill contains sub-skills that the workflow routes to automatically.
Start the skill normally — the dispatcher will determine which sub-skill to use.
Only use direct sub-skill access if the user explicitly requests a specific sub-skill by name.

Sub-skill step names are prefixed: `<subskill>/<step>` (e.g., `doctor/diagnose`).

### Direct sub-skill access

```bash
<skill>/scripts/run <subskill> --context '{}' --session new
<skill>/scripts/run <subskill> advance --session <id>
```

### Available sub-skills

- **doctor**: Diagnose and fix common Contentful issues.
- **setup**: Guided Contentful space setup and configuration.

## Reference topics

Quick-reference topics accessible without running the full workflow:

```bash
<skill>/scripts/run topics              # list all topics
<skill>/scripts/run topic <name>         # load a specific topic
```

- **rate-limits**: API rate limits and throttling
- **locales**: Content localization and locale configuration
