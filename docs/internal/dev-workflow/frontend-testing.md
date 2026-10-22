# Frontend Testing Guidelines

This document defines the testing strategy, coverage thresholds, and best-practice rules for the Taramisu frontend (`frontend/`). Our
setup follows the **Testing Trophy** model, combining static analysis, unit/component tests in Vitest, and real-browser end-to-end (E2E)
tests in Playwright.

---

## 1. Quick Start & Commands

Run all commands from `frontend/` (or via `npm --prefix frontend ...` from the repository root):

```bash
# Run unit and component tests once
npm test

# Run tests in interactive watch mode during development
npm run test:watch

# Run tests and enforce V8 code coverage thresholds (70% minimum)
npm run test:coverage

# Run Playwright E2E tests against the Vite production preview server
npm run test:e2e

# Open Playwright UI mode for interactive debugging and trace inspection
npx playwright test --ui
```

---

## 2. Testing Layers & Responsibilities

Rather than forcing every line of declarative UI through a single testing tool, each layer has a distinct responsibility and target
coverage expectation:

| Layer | Tooling | Target Scope | Expected Coverage / Goal |
| :--- | :--- | :--- | :--- |
| **1. Static Analysis** | TypeScript (`strict: true`), `oxlint` | Entire `src/` and `e2e/` | **100%** (`tsc -b` + `oxlint --deny-warnings`) |
| **2. Unit Tests** | Vitest | Pure business logic, TARA risk calculators, state stores, utilities, typed API client (`src/api/`) | **90–100%** (exhaustive edge cases & error paths) |
| **3. Component Integration** | Vitest + React Testing Library (`jsdom`) | Feature views, forms, conditional states (loading, error, empty), user interactions | **50–65%** (user-visible behavior, no shallow DOM mocking) |
| **4. End-to-End (E2E)** | Playwright (headless Chromium) | Real browser layout, React Flow (`@xyflow/react`) canvas/nodes/SVG edges, routing | **Critical user journeys** in a real layout engine |

---

## 3. Code Coverage Policy: Global 70% Threshold

Code coverage is measured via `@vitest/coverage-v8` in [`frontend/vite.config.ts`](../../../frontend/vite.config.ts) across `src/**/*.{ts,tsx}`
(excluding `src/main.tsx`, `src/test/**`, test files, and `.d.ts` type declarations).

We enforce a **global minimum threshold of 70%** across all four metrics:

* **Lines:** `70%`
* **Statements:** `70%`
* **Functions:** `70%`
* **Branches:** `70%`

### Why Global 70% Instead of 80% or Folder Exclusions?

1. **Realistic Weighted Average:**
   Pure domain logic, stores, and API clients naturally achieve **90–100%** coverage, while declarative UI views and canvas wrappers sit at
   **50–65%**. A global **70%** threshold reflects this natural balance without forcing artificial tests on layout code.
2. **Avoids Brittle "Shallow Testing":**
   Enforcing 80%+ globally on UI components pressures developers to write tests coupled to internal implementation details or heavy `jsdom`
   mocks for third-party canvas libraries (`@xyflow/react`), which lack a real layout engine in `jsdom`.
3. **Why We Do Not Exclude Component Folders:**
   In modern React architectures, boundaries between "pure UI" and "logic" blur quickly—components contain hooks, state transitions, and
   conditional rendering. Excluding entire directories (such as `src/components/**` or `src/pages/**`) would create blind spots for critical
   UI logic and invite "coverage evasion" (moving code into excluded folders to pass CI).

---

## 4. Core Testing Rules & Best Practices

### Rule 1: Test User-Visible Behavior, Not Implementation Details

* Query elements using accessible roles and labels (`getByRole`, `getByLabelText`, `getByText`) rather than CSS classes, DOM hierarchy, or
  internal component state.
* Trigger interactions using `@testing-library/user-event` (or `fireEvent` where appropriate) and assert on what the user sees on screen.

### Rule 2: Never Write "Coverage-Only" Render Tests

* Do not add meaningless smoke tests (e.g., rendering a component without meaningful assertions) solely to inflate line percentages.
* Every test must verify a concrete domain rule, state transition, accessibility contract, or user interaction.

### Rule 3: Split React Flow (`@xyflow/react`) Testing Between Vitest and Playwright

* **In Vitest (`jsdom`):** Test graph data transformations, node/edge builders, selection handlers, and surrounding toolbar state. Do not
  attempt to test pixel coordinates, viewport panning, or SVG edge paths in `jsdom`.
* **In Playwright (`e2e/`):** Verify that the React Flow canvas renders nodes, boundary groups, SVG edges, and interactive controls in
  headless Chromium against the production build (`vite preview`).

### Rule 4: Mock at the Network Boundary, Not Internal Hooks

* When testing feature components that fetch data (e.g., via `openapi-react-query`), prefer mocking at the HTTP/client boundary (`fetch` or
  typed API client methods) rather than mocking internal React hooks.
* Always test both the happy path and error/loading states.

---

## 5. Continuous Integration (CI)

Every pull request touching `frontend/**` executes the `frontend` job in [`.github/workflows/build.yml`](../../../.github/workflows/build.yml):

1. `npm run typecheck` (strict TypeScript validation across app and E2E suites)
2. `npm run test:coverage` (Vitest unit/component tests + enforced 70% V8 threshold)
3. `npm run build` (production bundle verification)
4. `npm run test:e2e` (Playwright Chromium E2E suite; uploads HTML report & traces as artifacts on failure)
5. Appends a **Frontend Test & Coverage Summary** table directly to `$GITHUB_STEP_SUMMARY`.
