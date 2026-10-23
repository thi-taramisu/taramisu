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

3. Merge the workflow and script into `main`. No application deployment is needed.
4. Apply labels to a test issue and PR, then check **Actions → Discord notifications**
   and the destination channels.

Missing secrets skip delivery, even if the workflow succeeds. Mentions are disabled.
Each webhook receives at most one message per run. Failed deliveries fail the job;
rerunning it can duplicate messages already sent.

Routing lives in `LABEL_WEBHOOKS` in `.github/scripts/discord_notifications.py`.
New webhook secrets must also be exposed in `.github/workflows/discord-notifications.yml`.
Keep webhook URLs in secrets, never in committed files.
