# ADR 0004: Frontend internationalization

- Status: Proposed
- Issue: [#256](https://github.com/thi-taramisu/taramisu/issues/256)
- Related: [ADR 0003](0003-frontend-date-format.md) (date format), [frontend README](../../../frontend/README.md)

## Context

The frontend currently has English text in components and shared labels. We want English and German, with a language switch that
works without reloading and remembers the choice per browser. This describes the planned implementation.

## Decision

Use **i18next and react-i18next** for React updates, fallback handling, interpolation and plurals. A dictionary helper would require
building those ourselves. React Intl is also suitable, but we prefer i18next's JSON files and feature namespaces.

Bundle both languages with the application. Keep matching JSON files under `frontend/src/i18n/locales/en/` and `de/`, grouped by
feature, with a `common` namespace for shared text. A translation server or HTTP loading plugin is unnecessary for two languages.
Translate all UI text, including errors and accessible labels; stored content and API values keep their original representation.

### Language and formatting

Add an **English / Deutsch** selector to the shared header, available before and after sign-in.
Choose the initial language from the saved browser preference, then the first supported browser language, then English.
Treat regional variants such as `de-DE` as `de`. Persist explicit choices in `localStorage`, but allow switching if storage is unavailable.
Use English for missing translations and keep the document's `lang` attribute in sync.

Format quantities with `Intl.NumberFormat` using the selected language (`en-GB` or `de-DE`). Keep calendar dates as **`YYYY-MM-DD`**
in both languages, following [ADR 0003](0003-frontend-date-format.md), which is still Proposed, and the existing member settings display.
This is an explicit exception to #256's request for localized date formatting.

### Terminology

Keep a shared glossary for domain labels and reuse its translation keys across features.
[DIN Media](https://www.dinmedia.de/de/norm/iso-sae-21434/345375662) lists ISO/SAE 21434:2021-08 in English only;
we have not found an official German edition to check against. The German labels below follow
[UL Solutions' German TARA guide](https://www.ul.com/de/sis/resources/threat-analyses-and-risk-assessment-in-practice-tara),
checked on 2026-11-15. This is industry usage, not normative German terminology from the standard.

| English | German UI label | Basis in UL guide |
| --- | --- | --- |
| Item | Item | Project choice: retain the English term; the guide uses “Artikel” |
| Asset | Asset | Step 1 |
| Damage scenario | Schadensszenario | Steps 1–2 |
| Threat scenario | Bedrohungsszenario | Step 3 |
| Attack path | Angriffspfad | Step 4 |
| Impact rating | Bewertung der Auswirkungen | Step 2 |
| Attack feasibility rating | Bewertung der Durchführbarkeit eines Angriffs | Step 5 |
| Risk value | Risikowert | Step 6 |
| Risk treatment decision | Entscheidung über Risikobehandlung | Step 7 |

Keep ISO/SAE references, work-product numbers and acronyms such as TARA unchanged. Add new domain terms to the glossary when needed,
instead of choosing a different translation on each page.

## Consequences

- Two new runtime dependencies: `i18next` and `react-i18next`.
- Maintain English and German together. Check matching keys and interpolation placeholders automatically, with focused tests for
  language selection, persistence, switching and document language.
- Authentik's login UI uses its own translations. Investigate its broken language switcher separately; sharing the app's language
  preference with Authentik is still open. No backend changes or account-level language setting are planned here.

## References

- [react-i18next setup and hooks](https://react.i18next.com/latest/using-with-hooks)
- [i18next configuration options](https://www.i18next.com/overview/configuration-options)
