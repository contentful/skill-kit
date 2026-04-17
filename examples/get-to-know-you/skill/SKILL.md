---
name: get-to-know-you
description: A playful interview that gets to know the user and produces a profile trading card. Use when the user wants to introduce themselves or when you want to break the ice.
metadata:
  version: "1.0.0"
---

# get-to-know-you

This skill is driven by a compiled CLI binary. Follow the invocation pattern below.

## Invocation

### Start the workflow

```bash
<skill-dir>/scripts/run start --context '{}'
```

Parse the JSON output. It contains:
- `step`: the current step name
- `prompt`: instructions to follow
- `schema`: JSON Schema for the expected output

### Follow the prompt

Read the `prompt` field and perform the described task. Produce output matching the `schema`.

### Advance to the next step

```bash
<skill-dir>/scripts/run advance --step <step-name> --output '<your-json-output>' --history '<history-array>'
```

The `--history` flag must contain the full array of prior step results. Each time you receive
a response with a `completed` field, append it to the history array for the next call.

### Repeat until done

Continue the start → advance loop until the response contains `"done": true`.
The `finalOutput` field contains the skill's result.

## Steps

- **greet**: (dynamic)
- **ask-role**: (dynamic)
- **ask-stack**: (dynamic)
- **ask-tools**: (dynamic)
- **ask-team-size**: (dynamic)
- **ask-specialty**: (dynamic)
- **ask-hobby**: (dynamic)
- **confirm-profile**: (dynamic)
- **profile-card**: (dynamic)
