# Publishing Docker images

The **Publish Docker images** workflow (`.github/workflows/publish.yml`) builds
and pushes these images to GitHub Container Registry (GHCR):

| Service | Image | Build context |
| --- | --- | --- |
| API | `ghcr.io/thi-taramisu/taramisu-api` | `backend/` |
| Frontend | `ghcr.io/thi-taramisu/taramisu-frontend` | `frontend/` |
| Docs | `ghcr.io/thi-taramisu/taramisu-docs` | Repository root |

Each image includes `linux/amd64` and `linux/arm64` in one manifest, so Docker
selects the matching architecture when pulling it. Each service has its own
GitHub Actions layer cache. Builds use the existing service Dockerfiles.

## Run a build

In GitHub, open **Actions → Publish Docker images → Run workflow**. Select the
branch or tag to build, choose `all`, `api`, `frontend`, or `docs`, and optionally
enter a stable version such as `v1.2.3` or `1.2.3`. The version labels the selected
commit; it does not create a Git tag or change which commit is checked out.
Leave it empty for a development build. Prerelease versions are not supported.

Pushes to `main` publish all three images. Pushing a release Git tag such as
`v1.2.3` also publishes all three images from that tag.

## Tags and rollbacks

| Trigger | Tags on each selected image |
| --- | --- |
| Push to `main`, or manual run on `main` without a version | `latest`, `sha-<7-character-commit>` |
| Manual run on another branch without a version | `sha-<7-character-commit>` |
| Push of `v1.2.3` | `v1.2.3`, `v1.2`, `sha-<7-character-commit>` |
| Manual run with version `1.2.3` | `v1.2.3`, `v1.2`, `sha-<7-character-commit>`, plus `latest` if run on `main` |

`latest` follows the default branch; publishing a Git tag does not move it.
Use SHA tags to select a commit for rollback, for example
`ghcr.io/thi-taramisu/taramisu-api:sha-abc1234`. Version and SHA tags can be
overwritten by rerunning a build; use the published digest (`@sha256:...`) when
strictly immutable deployment pinning is required.

## Registry and build configuration

The publish job logs into GHCR with the repository's `GITHUB_TOKEN` and scoped
`packages: write` permission. No personal access token is needed for publishing.
If an image package already exists, ensure this repository has Actions write
access to it. Package visibility and deployment pull credentials are managed
separately in GHCR; this workflow does not change package visibility or deploy.

Set the repository Actions variable `DOCS_SITE_URL` to the public documentation
origin before publishing docs. It defaults to `http://localhost:8080`; the docs
image serves the site at `/`. Changing the origin requires a rebuild.

Frontend configuration is compiled into the static image by Vite. Runtime
container environment variables do not change it. Additional frontend build
settings must be exposed by its Dockerfile and passed through the workflow.
