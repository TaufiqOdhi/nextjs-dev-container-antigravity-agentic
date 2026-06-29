## Consensus
- **Base Image**: `node:20-bookworm` is chosen to support standard glibc libraries required by native compiled binaries of the Antigravity CLI.
- **Container User**: Run as `USER node` (UID 1000) inside the Dockerfile to prevent file permission issues when files are created/modified on the host.
- **Volume Mounts**:
  - Host workspace root maps to `/app` inside the container.
  - Local directory `./.gemini` maps to `/home/node/.gemini` (read/write).
  - Host `~/.gitconfig` and `~/.ssh` map to `/home/node/.gitconfig` and `/home/node/.ssh` respectively (read-only) for git config and auth credentials.
- **Next.js Initialization**:
  - Since the workspace root already contains metadata directories, bootstrapping must be done in a temporary directory (e.g. `/tmp/nextjs-bootstrap`), and then the contents must be merged/moved back to `/app`.
  - Next.js must be configured with App Router, TypeScript, ESLint, Tailwind CSS, and src/ directory structure.
  - Install dependencies: `zustand` and `swr`.
  - Initialize shadcn/ui using `npx shadcn@latest init` (using defaults, non-interactive mode).

## Resolved Conflicts
- **Base Image Variant**: Explorer 1 suggested `node:20-slim`, while Explorers 2 and 3 suggested `node:20-bookworm`. We resolve to use `node:20-bookworm` as it contains complete standard utilities (like build tools or curl/git) which may be needed for compiling/installing `agy` dependencies, whereas `slim` might be missing them.
- **Antigravity CLI Installation**:
  - Explorer 1 suggested globally installing `google-antigravity` via pip.
  - Explorer 3 suggested installing `agy` using the installer shell script `curl -fsSL https://antigravity.google/install.sh | bash` or global NPM package.
  - We resolve to try standard pip installation (`pip install google-antigravity`) or look for a pre-installed binary, and fall back to the curl script or other standard installer depending on availability.

## Dissenting Views
None.

## Gaps
- Exact version/installation source of `agy` within this specific system. The implementation worker must inspect the environment or check if `agy` is globally available or needs standard Python `pip` installation.
