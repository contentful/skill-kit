---
name: get-to-know-you
description: A playful interview that gets to know the user and produces a profile trading card. Use when the user wants to introduce themselves or when you want to break the ice. Trigger keywords: introduce myself, trading card, get to know me, ice breaker
metadata:
  version: "1.0.0"
---

# get-to-know-you

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

- **greet**: (dynamic)
- **ask-role**: (dynamic)
- **ask-stack**: (dynamic)
- **ask-tools**: (dynamic)
- **ask-team-size**: (dynamic)
- **ask-specialty**: (dynamic)
- **ask-hobby**: (dynamic)
- **confirm-profile**: (dynamic)
- **profile-card**: (dynamic)
