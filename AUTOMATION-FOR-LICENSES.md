# License Automation

This project includes an automated license management workflow that tracks direct dependencies and keeps compliance files up to date.

## Running the license update script

To regenerate licensing artifacts:

```bash
pnpm run update-licenses
```

The script will:

1. Scan direct runtime and development dependencies from `package.json`
2. Read dependency license metadata from installed packages in `node_modules`
3. Update the root `NOTICE` file
4. Rebuild the `licenses/` directory with one file per discovered license

## When to run

Run the script whenever dependencies change:

- After adding a dependency
- After removing a dependency
- Before a release or tag
- In CI (optional)

## Output

The command prints:

- Runtime dependency count
- Development dependency count
- Discovered unique license ids
