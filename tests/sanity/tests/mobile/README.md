# Mobile acceptance paths

Task 1 changes test infrastructure only. It does not establish that Create or Kanban has a product defect.
The test uses the existing sanity login, workspace, tracker navigation and Issue page objects. API writes
are limited to synthetic fixture setup and cleanup. A pre-existing sanity Issue supplies only the project
type and rank. The model supplies its first creatable Issue kind and initial status; the UI selects All
to avoid hiding fixtures behind an Active/Backlog mode. Run against a dedicated synthetic uistack workspace/account.

Concrete Issue viewlets are queried by `attachTo` and descriptor, excluding secondary variants. The model
uses `view.viewlet.List` for List and `tracker-resources/src/plugin.ts`'s `viewlet.Kanban` for Board;
`tracker-resources.viewlet.List` is not the List descriptor registered by the current model. Neither
concrete `IssueList` nor `IssueKanban` is part of the public tracker plugin used by the old survey.

The test opens the fixture project through the navigator, verifies distinct List and Board renderers,
opens and cancels the empty Create form, and locates description and comment in separate editor scopes.
Phone projects repeat these paths in portrait and landscape. A fresh page resets overlays before each
independent path. `MobileStepResult` distinguishes `ui`, `url-recovery` and `not-tested`; recovery never
passes acceptance. Cleanup discovers trigger-created descendants, verifies remaining IDs separately,
and resets only this run's stale tab destinations. No attachment or text edits are performed.

The Svelte harness is compiled in the test worker using existing esbuild/Svelte tools, and served on an
ephemeral loopback port. It adds no product route. Task 1 checks harness readiness only. Later component
tasks add their production components and legacy adapters; harness readiness is not app-flow evidence.

## Evidence commands (operator-run only)

Install/build the lane's normal dependencies and browsers through the existing lane workflow beforehand.
The runner never installs browsers, builds the application, starts a stack, or chooses a fallback URL.
Use the **source worktree containing this uncommitted test**, with installed sanity dependencies. Both
lane product deployments must serve the same verified `pc/develop` commit for Task 1. Set these values
from the actual lane deployments, not from an assumed local checkout:

```bash
export MOBILE_PWA_REPO=/home/ai-agent/code/huly-platform-wt/pcfix-mobile-01
export PC_DEVELOP_URL='https://YOUR-BASELINE-LANE'
export MOBILE_PWA_URL='https://YOUR-CANDIDATE-LANE'
export PC_DEVELOP_COMMIT=5e2e4eec740990cbe7ac8b5612db02e98f19727c
export MOBILE_PWA_COMMIT=5e2e4eec740990cbe7ac8b5612db02e98f19727c
export PLATFORM_WS='YOUR-SYNTHETIC-WORKSPACE'
export PLATFORM_USER='YOUR-SYNTHETIC-USER'
read -rs -p 'Lane password: ' MOBILE_PWA_PASSWORD
export MOBILE_PWA_PASSWORD
# If the lane uses a non-default browser cache, export PLAYWRIGHT_BROWSERS_PATH too.
node /home/ai-agent/code/huly-platform-wt/tools/ghci/pc-review-2026-10-26/mobile-1.mjs --target candidate
node /home/ai-agent/code/huly-platform-wt/tools/ghci/pc-review-2026-10-26/mobile-1.mjs --evidence
```

`--evidence` runs the legacy survey adapter first, then the repaired survey, with the same test source and
product revision. The legacy assertion reads the old missing plugin viewlets **after** authentication,
fixture readback and harness compilation have succeeded. Setup/browser/import failures, missing projects,
failed cleanup or missing artifacts are `invalid`, not valid red evidence. Individual baseline checks use
`--target baseline`. All five projects run by default, with retries disabled.

Artifacts are stored outside this repository under
`tools/ghci/pc-review-2026-10-26/out/mobile-1/mobile-evidence-*/{red,green}/`:
fixture-only masked PNGs, action-only traces, per-test results and assertion summaries. The combined
summary includes both deployment SHAs, checkout dirty state and a SHA-256 digest of the test sources.
Traces deliberately omit DOM snapshots, network, resources, console messages, source files and fill
arguments. Raw failure-context dumps are removed. These traces support action-order review; screenshots
supply the visual evidence. Treat `ui` plus independent `cleanup: ok` as the acceptance contract.

## Implementation verification

On 2026-10-31, branch `pcfix/mobile-01-testpaths`, local HEAD and `pc/develop` both matched
`5e2e4eec740990cbe7ac8b5612db02e98f19727c`; the GitHub branch endpoint confirmed the same revision.
Discussion #252 could not be retrieved through either GitHub CLI or the web fetch. No maintainer
agreement is inferred; the discussion check remains outstanding before upstream review.

Offline behavioral contracts were written first and failed on missing model IDs and false recovery/
cleanup acceptance. After implementation, the Node regression suite passed, including an injected
process-boundary test of the full runner's red/green orchestration and trace redaction. Its mock artifacts
are under `/tmp/mobile-runner-offline-*/mock-evidence`, never the live evidence directory.

Strict no-emit TypeScript checks and five-project test discovery ran in a temporary copy with read-only
installed dependencies. That installation has Playwright 1.56.1 and Faker 8.4.1, older than the manifest.
The unchanged shared `utils.ts` produces two `internet.username` errors with that Faker; replacing it
with `internet.userName` **only in the temporary copy** allowed strict checking and import discovery to
pass. The Svelte harness bundle also compiled without warnings. No browser was launched and no live
red/green evidence, Docker, stack, formatter, Rush build, package validation or commit was executed.
A diagnostics tool was not available. Live browser acceptance and lane validation remain pending.

Offline regression command after dependencies are installed:

```bash
MOBILE_PWA_REPO=/home/ai-agent/code/huly-platform-wt/pcfix-mobile-01 \
node /home/ai-agent/code/huly-platform-wt/tools/ghci/pc-review-2026-10-26/mobile-runner.test.mjs
```

`MOBILE_PWA_DEPS` can point to a separate existing dependency checkout for offline tests. It is not used
by live evidence: live tests resolve the source worktree's declared dependencies normally.
