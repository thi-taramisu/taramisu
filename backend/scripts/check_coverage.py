"""Report Go statement coverage and enforce 80% for each domain package."""

import os
from pathlib import Path
import sys

MODULE = "github.com/thi-taramisu/taramisu/backend/"
THRESHOLD = 80


def coverage_table(profile):
    lines = profile.splitlines()
    if not lines or lines[0] not in ("mode: set", "mode: count", "mode: atomic"):
        raise ValueError("missing or invalid Go coverage profile header")
    packages = {}
    for line in lines[1:]:
        block, statements, count = line.split()
        filename, _ = block.rsplit(":", 1)
        statements, count = int(statements), int(count)
        if statements < 0 or count < 0:
            raise ValueError("negative statement or execution count")
        if not filename.startswith(MODULE):
            continue
        relative = filename[len(MODULE):]
        if not relative.startswith(("internal/httpapi/", "internal/service/")):
            continue
        package = relative.rsplit("/", 1)[0]
        covered, total = packages.get(package, (0, 0))
        packages[package] = (covered + (statements if count > 0 else 0), total + statements)
    if not packages or not any(total for _, total in packages.values()):
        raise ValueError("no domain statements found in coverage profile")
    rows = [
        "### Backend statement coverage\n",
        "Scope: `internal/httpapi/...` and `internal/service/...`; "
        "excludes `internal/db/` (sqlc) and `cmd/`.\n",
        "| Package | Covered | Total | Coverage | Minimum | Result |",
        "| :--- | ---: | ---: | ---: | ---: | :--- |",
    ]
    passed = True
    for package, (covered, total) in sorted(packages.items()):
        if total == 0:
            continue
        ok = covered * 100 >= THRESHOLD * total
        passed = passed and ok
        rows.append(
            f"| `{package}` | {covered} | {total} | {covered / total:.2%} "
            f"| {THRESHOLD}% | {'Passed' if ok else 'Failed'} |"
        )
    return "\n".join(rows) + "\n", passed


def main():
    try:
        report, passed = coverage_table(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except (OSError, ValueError, IndexError) as error:
        report = f"### Backend statement coverage\n\nCoverage check failed: {error}\n"
        passed = False
    print(report)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as output:
            output.write(report + "\n")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
