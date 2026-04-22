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

### Detect your host

Determine which agent host you are running in, and pass it as `--host`:
- Claude Code: `--host claude-code`
- Codex: `--host codex`
- OpenCode: `--host opencode`
- Unknown/other: omit the flag (defaults to generic)

### Step 1: Start

```bash
${CLAUDE_SKILL_DIR}/scripts/run --context '{}' --host claude-code
```

The output is JSON with these fields:
- `preamble` — **Read this first.** It defines verb-to-tool mappings (e.g., ASK_STRUCTURED, ASK_FREEFORM) that prompts use throughout the skill. Follow these mappings for every step.
- `step` — the current step name
- `prompt` — instructions for you to follow (read these carefully, using the verb mappings from the preamble)
- `schema` — JSON Schema describing the output you must produce

### Step 2: Follow the prompt

Read the `prompt` field. It contains instructions — follow them. The prompt may ask you to
use specific tools (like AskUserQuestion), write files, analyze code, or interact with the user.
Do what the prompt says, then produce a JSON object matching the `schema`.

### Step 3: Advance

Pass your JSON output back, along with the conversation history:

```bash
${CLAUDE_SKILL_DIR}/scripts/run advance --step <step-name> --output '<your-json>' --history '<history>' --host claude-code
```

- `--step`: the step name from the previous response
- `--output`: your JSON response matching the schema
- `--history`: a JSON array tracking the conversation. Start with `[]`. After each advance,
  the response includes a `completed` field — append it to the array for the next call.

### Step 4: Repeat until done

Keep advancing until the response contains `"done": true`. The `finalOutput` field
contains the skill's result. Present it to the user.

### Important

- **Never show raw JSON output or Bash commands to the user.** The user sees your natural
  language responses, not the protocol.
- **Always pass `--history`** with the accumulated array. The binary is stateless — it
  reconstructs context from the history on each call.
- **If you get a validation error** (the response has `"error": "validation"`), read the
  `message` field, fix your output, and retry the same step.

## Steps in this skill

- **classify**: (dynamic)
- **clarify**: (dynamic)
- **get-space**: Ask the user for their Contentful space ID, or detect it from CONTENTFUL_SPACE_ID in the environm...
- **ask-topic**: (dynamic)


## Sub-skills

This skill contains sub-skills that the workflow routes to automatically.
Start the skill normally — the dispatcher will determine which sub-skill to use.
Only use direct sub-skill access if the user explicitly requests a specific sub-skill by name.

Sub-skill step names are prefixed: `<subskill>/<step>` (e.g., `doctor/diagnose`).

### Direct sub-skill access

```bash
${CLAUDE_SKILL_DIR}/scripts/run <subskill> --context '{}'
${CLAUDE_SKILL_DIR}/scripts/run <subskill> advance --step <step> --output '...' --history '[...]'
```

### Available sub-skills

- **doctor**: Diagnose and fix common Contentful issues.
- **setup**: Guided Contentful space setup and configuration.

## Reference topics

Quick-reference topics accessible without running the full workflow:

```bash
${CLAUDE_SKILL_DIR}/scripts/run topics              # list all topics
${CLAUDE_SKILL_DIR}/scripts/run topic <name>         # load a specific topic
```

- **rate-limits**: API rate limits and throttling
- **locales**: Content localization and locale configuration
