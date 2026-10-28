# Discord notifications

GitHub Actions notifies Discord when issues or PRs targeting `main` are opened
with matching labels, or when those labels are added. Adding a label notifies
only its destination. Labels are case-sensitive; unknown labels are ignored.

## Setup

1. Create a webhook in each Discord channel under **Edit Channel → Integrations → Webhooks**.
2. Save the URLs as GitHub repository secrets under **Settings → Secrets and variables → Actions**:

   | Labels | Channel | Secret |
   | --- | --- | --- |
   | `backend` | `#backend` | `DISCORD_BACKEND_WEBHOOK` |
   | `frontend` | `#frontend` | `DISCORD_FRONTEND_WEBHOOK` |
   | `IAM`, `infrastructure`, `CI/CD`, `devops` | `#devops` | `DISCORD_DEVOPS_WEBHOOK` |

3. Enable **Allow anyone to @mention this role** for the configured roles under
   **Server Settings → Roles**. Role IDs live in `LABEL_ROLES` in the script.
4. Merge the workflow and script into `main`. No application deployment is needed.
5. Apply labels to a test issue and PR, then check **Actions → Discord notifications**
   and the destination channels.

## Issue role mentions

Issues ping Backend, Frontend, CI/CD, Containerisierung, or IAM / Security for
`backend`, `frontend`, `CI/CD`, `infrastructure`, or `IAM`, respectively. Adding a
label pings only its role; each role is mentioned once per message. PRs and the
`devops` label never ping roles. User mentions and `@everyone` / `@here` are blocked.

Missing webhook secrets skip delivery, even if the workflow succeeds.
Each webhook receives at most one message per run. Failed deliveries fail the job;
reruns or removing and re-adding labels can repeat notifications and pings.

Routing and role IDs live in `.github/scripts/discord_notifications.py`
(`LABEL_WEBHOOKS` and `LABEL_ROLES`). Role IDs are not secrets.
New webhook secrets must also be exposed in `.github/workflows/discord-notifications.yml`.
Keep webhook URLs in secrets, never in committed files.
Offline tests:

```sh
python3 -m unittest discover -s .github/scripts -p 'test_*.py'
```
