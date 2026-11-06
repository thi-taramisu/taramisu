# ADR 0003: Date format in the frontend

- Status: Proposed
- Issue: #96
- Related: [ADR 0002](0002-frontend-ui-library.md) (UI library), [route concept](../frontend-routes.md) (open question on language)

## Context

The member settings show the first date in the UI ("Added", from `assigned_at` in the [data model](../architecture/data-model.md)).
More might follow. Without a rule, every page picks its own format, or the browser decides.

ISO/SAE 21434 does not prescribe a date format.

In the automotive industry, OEMs and Tier-1 suppliers still define one in their internal guidelines, because teams in Germany, the USA
and China work on the same analyses: `03/04/2026` is 3 April in Germany but 4 March in the USA.

## Options

1. **Browser locale** (`Intl.DateTimeFormat` without a fixed locale). Familiar for each user, but the same date looks different for each
   team member, and German or other date formats would appear next to the English UI. Tests depend on the machine's locale.
2. **One fixed national format**, e.g. British `27/10/2026`. Consistent, but still ambiguous for US readers.
3. **ISO 8601 calendar date** (`2026-10-27`). Unambiguous in every country, independent of language and locale.

## Decision

The frontend shows dates as **ISO 8601 calendar dates (`YYYY-MM-DD`)**, wrapped in a `<time dateTime="…">` element.

- The order (year, month, day) cannot be confused, regardless of the reader's locale.
- It is the international standard.
- It sorts correctly as text, which helps in tables, exports and file names.
- It does not depend on browser language or locale, so screenshots, reports and tests look the same everywhere.

## Consequences

- If the UI gets a German version (open question in the route concept), the date format stays ISO 8601.
