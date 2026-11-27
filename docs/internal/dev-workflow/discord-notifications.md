# Discord notifications

New issues are summarized at **09:00 and 19:00 Europe/Berlin** (CET/CEST, adjusting for daylight saving) using their current labels.
Empty channels stay silent; digests include titles and links without pings.
The first message in each active channel also lists up to eight open, approved PRs with matching labels,
with a link to the full list when more qualify.
The initial lookback is 24 hours; later runs catch up from the last delivery.
Labels added after an issue has been processed do not send another entry.

PRs targeting `main` notify on opening or labeling, once per destination.
A label for a new channel sends there; repeated labels stay silent.
Merges send a separate **Pull request merged** message. Unmerged closes stay silent.
All PR messages are mention-free.

## Setup

Create channel webhooks and save their URLs as repository Actions secrets:

| Labels | Channel | Secret |
| --- | --- | --- |
| `backend` | `#backend` | `DISCORD_BACKEND_WEBHOOK` |
| `frontend` | `#frontend` | `DISCORD_FRONTEND_WEBHOOK` |
| `IAM`, `infrastructure`, `CI/CD`, `devops` | `#devops` | `DISCORD_DEVOPS_WEBHOOK` |

Merge into `main`; no application deployment is needed. Missing secrets skip delivery.
Routing is configured in `.github/scripts/discord_notifications.py` and secrets in
`.github/workflows/discord-notifications.yml`.

Actions needs permission to create/update `automation/discord-issue-digest-state`.
Keep this branch: it records delivery checkpoints for serialized PR and digest runs.
Initial setup publishes the branch with its tracking file already in place, so interrupted setup can retry.
Delivery history follows the secret names in the table above; replacing a webhook URL preserves that history.
Deleting it resets duplicate suppression. A lost Discord response or failed checkpoint
write after delivery can still cause a duplicate on retry.
Labels applied using `GITHUB_TOKEN` do not trigger a notification run; automation must
invoke delivery explicitly after labeling with the same serialization.

Test locally without sending messages:

```sh
python3 -m unittest discover -s .github/scripts -p 'test_*.py'
```
