# Contributing to @contentful/skill-kit

Thanks for your interest in contributing.

## How to contribute

- Open an issue to report bugs or suggest enhancements.
- For larger changes, start with an issue before opening a PR.
- For smaller fixes and docs updates, feel free to open a PR directly.

## Local development

Prerequisites:

- Node.js 24+
- pnpm

Install dependencies:

```sh
pnpm install
```

## Validate your changes

Run the checks before opening a PR:

```sh
pnpm typecheck
pnpm test
pnpm run format:check
```

If you changed dependencies, also refresh licensing files:

```sh
pnpm run update-licenses
```

## Pull request checklist

- Keep PRs focused and easy to review.
- Use conventional commits where possible.
- Update docs when behavior or usage changes.
- Do not include secrets or credentials.

## Code of conduct

By participating in this project, you agree to follow the Contentful Developer Code of Conduct:
https://www.contentful.com/developers/code-of-conduct/
