# GitHub Repository Guidelines & Configuration

This document outlines the configured governance rules, branch protections, and security guardrails enforced for this repository. All team members must adhere to these workflows.

---

## 1. Branch Protection (`main`)

The `main` branch serves as the single source of truth and is strictly protected against direct modifications.

* **No Direct Pushes:** Direct commits cannot be pushed to `main`. All changes must go through a Pull Request.
* **Pull Request Requirements:**
  * **Approvals:** At least **1 peer approval** is required before merging.
  * **Latest Push Approval:** Approvals must come from someone other than the author of the most recent reviewable push.
  * **Dismiss Stale Approvals:** Pushing new commits to an open PR automatically dismisses existing approvals to ensure newly introduced code is reviewed.
  * **Conversation Resolution:** All review conversations/comments must be resolved before a PR can be merged.
* **Merge Strategy:**
  * Only standard **Merge commits** (`Create a merge commit`) are allowed.
  * *Squash and merge* and *Rebase and merge* are disabled.
* **Safety & Integrity:**
  * **Block Force Pushes:** Force pushes (`git push --force`) are prohibited.
  * **Restrict Deletions:** Deletion of the `main` branch is prevented.
  * **Required Status Checks:** CI Checks must pass successfully prior to merge (CodeQL scanning also active).

---

## 2. Automated Security & Scanning

Automated scanning is enabled to maintain high security standards and prevent secrets or vulnerabilities from reaching production:

* **CodeQL Analysis:**
  * Runs automatically on every PR targeting `main` and on direct updates.
  * Analyzes source code and configurations (TypeScript, Go, and GitHub Actions workflows).
* **Secret Scanning & Push Protection:**
  * GitHub actively scans for leaked secrets, API keys, and credentials.
  * Push protection blocks commits that contain identified secrets before they leave the developer's machine.
* **Dependency Management & Alerts:**
  * **Dependency Graph:** Enabled to track project dependencies.
  * **Dependabot Alerts:** Enabled to notify the team about known vulnerabilities in third-party dependencies, including malware alerts.

---

## 3. Branch Hygiene

* **Automatic Branch Cleanup:** Head branches are automatically deleted once a PR is merged into `main`.
