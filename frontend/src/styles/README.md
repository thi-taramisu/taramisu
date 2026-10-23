# Frontend colour sheet

Built on the Tailwind v4 / shadcn setup from [#113](https://github.com/thi-taramisu/taramisu/pull/113) and
[#82](https://github.com/thi-taramisu/taramisu/issues/82). These are palette proposals for team review. No palette choice or TARA assessment
policy is implied.

Run `npm run dev` and open [the comparison page](http://localhost:5173/design-system/colors). It shows all three schemes in light and dark
mode. Each scheme also has its own shareable application route: `/design-system/colors/neutral`, `/design-system/colors/ocean` and
`/design-system/colors/iris`. The old `/design-sheet.html` URL redirects to the comparison. These pages are server-rendered in development
and production.

## Configuration

Tailwind v4 uses CSS configuration. `styles/tailwind.css` registers theme tokens with `@theme inline`; there is no second JavaScript
Tailwind configuration.

| File | Purpose |
| --- | --- |
| `../index.css` | CSS entry point and imports; also the entry used by the shadcn CLI |
| `tailwind.css` | Tailwind utilities, fonts, radius and dark variant |
| `themes/neutral.css` | Default neutral palette, light and dark |
| `themes/ocean.css` | Cool slate surfaces and blue controls, light and dark |
| `themes/iris.css` | Warm stone surfaces and violet controls, light and dark |
| `tara.css` | Shared risk, rating and entity colours, light and dark |
| `base.css` | Document sizing and base styles |

Set the scheme on the document root. Omit the attribute for Neutral. Dark mode is independent of the palette:

```html
<html data-color-scheme="ocean">
<html data-color-scheme="iris" class="dark">
```

Use existing semantic shadcn utilities such as `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`,
`bg-sidebar-accent` and `text-sidebar-accent-foreground`. New components should not select a palette or hard-code its hex values. Keep
palette overrides and TARA colours in their respective files. When adding shadcn components, retain these imports if the CLI proposes
replacing the entry stylesheet.

## TARA colours

The enum names and score range follow the repository's [data model](../../../docs/internal/architecture/data-model.md). The colours are UI
proposals and do not define a risk matrix, risk acceptance or ISO requirements. Review the mappings with the frontend/domain teams before
adopting them.

Every token has background, foreground and border utilities. For example:

```tsx
<span className="rounded-md border border-risk-4-border bg-risk-4 px-2 py-1 text-risk-4-foreground">
  Risk 4
</span>
```

| Meaning | Token stem | Proposed colour |
| --- | --- | --- |
| Risk score 1 | `risk-1` | Blue |
| Risk score 2 | `risk-2` | Cyan |
| Risk score 3 | `risk-3` | Amber |
| Risk score 4 | `risk-4` | Orange |
| Risk score 5 | `risk-5` | Red |
| Missing / not yet rated | `rating-unknown` | Neutral |
| Impact: NEGLIGIBLE | `impact-negligible` | Blue |
| Impact: MODERATE | `impact-moderate` | Amber |
| Impact: MAJOR | `impact-major` | Orange |
| Impact: SEVERE | `impact-severe` | Red |
| Impact: OMITTED | `impact-omitted` | Neutral, explicitly labelled Omitted |
| Feasibility: VERY_LOW | `feasibility-very-low` | Blue |
| Feasibility: LOW | `feasibility-low` | Cyan |
| Feasibility: MEDIUM | `feasibility-medium` | Amber |
| Feasibility: HIGH | `feasibility-high` | Red |

Impact and feasibility reuse colour values, not numeric risk scores. `OMITTED` and an unknown rating must remain distinct in text. Always
render the exact score or enum label; do not label score 1 as accepted or safe without a domain decision.

Entity tokens identify types and carry no ordering: `entity-item` (indigo), `entity-asset` (cyan), `entity-damage` (orange), `entity-threat`
(rose) and `entity-attack` (purple). They also have `-foreground` and `-border` variants. Keep them separate from the rating displayed on an
entity. Generic `chart-1`–`chart-5` tokens are categorical UI colours and must not replace explicit risk tokens.

## Accessibility and adoption

- Use each background with its matching foreground; never use a pale background token as text on white.
- Show a number or explicit label as well as colour. Graphs also need labelled nodes/edges or another non-colour cue.
- A rating's colour does not change between UI palettes. An unassessed scenario is not automatically low risk.
- Check real controls, hover/focus states, colour-blindness simulations and grayscale as part of
  [#88](https://github.com/thi-taramisu/taramisu/issues/88). Token contrast checks do not complete that review.
- Keep the default Neutral until the team chooses a scheme. No theme preference storage or product settings UI is introduced here.
