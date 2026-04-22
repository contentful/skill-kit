# Contentful Locales

Every space has a default locale (usually `en-US`). Additional locales can be added in Settings > Locales.

Key concepts:

- **Fallback chain:** Locales can fall back to another locale when content is missing
- **Optional vs required:** Locales can be marked as optional for specific content types
- **Field-level localization:** Each field can be independently localized

Common patterns:

- Use `locale=*` in API queries to fetch all localizations at once
- Set `fallbackCode` to create locale hierarchies (e.g., `en-GB` falls back to `en-US`)
