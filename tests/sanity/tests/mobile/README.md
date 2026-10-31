# Mobile acceptance paths

Task 1 changes test infrastructure only. It does not establish that Create or Kanban has a product defect.
The test uses the existing sanity login, workspace, tracker navigation and Issue page objects. API writes
are limited to synthetic fixture setup and cleanup. A pre-existing sanity Issue supplies only the project
type and rank. The model supplies its first creatable Issue kind and initial status; the UI selects All
to avoid hiding fixtures behind an Active/Backlog mode. Run against a dedicated synthetic uistack workspace/account.

Concrete Issue viewlets are queried by `attachTo` and descriptor, excluding secondary variants. The model
uses `view.viewlet.List` for List and the registered `tracker:viewlet:Kanban` descriptor ID for Board;
`tracker-resources.viewlet.List` is not the List descriptor registered by the current model. Neither
concrete `IssueList` nor `IssueKanban` is part of the public tracker plugin used by the old survey.

The test opens the fixture project through the navigator, verifies distinct List and Board renderers,
opens and cancels the empty Create form, and locates description and comment in separate editor scopes.
Phone projects repeat these paths in portrait and landscape. A fresh page resets overlays before each
independent path. `MobileStepResult` distinguishes `ui`, `url-recovery` and `not-tested`; recovery never
counts as UI acceptance. Cleanup discovers trigger-created descendants, verifies remaining IDs separately,
and resets only this run's stale tab destinations. No attachment or text edits are performed.

Task 1 acceptance runs exclusively against the built frontend at the explicit lane URL. The default
`tests/playwright.config.ts` excludes `mobile/**`; only `tests/mobile-pwa.config.ts` discovers these tests.

Task 2a introduces the isolated component harness (`MobileHarness.svelte`, `harness.html`, `harness.ts`)
and its worker fixture when testing the viewport service without an app consumer. Declare esbuild,
Svelte and svelte-preprocess in that task, compile/serve on an ephemeral loopback port, and provide the
legacy adapter as required by the plan. Task 2b then extends it for the form frame. Harness readiness
remains separate from app-flow evidence; Task 1 has no component harness or direct Svelte build dependencies.
`fflate` belongs only to the external runner's `mobile-tools/package.json`, not to the Rush workspace.

## Evidence commands (operator-run only)

Install/build the lane's normal dependencies and browsers through the existing lane workflow beforehand.
The runner never installs browsers, builds the application, starts a stack, or chooses a fallback URL.
Install its separate artifact dependency once with:

```bash
npm install --ignore-scripts --prefix /home/ai-agent/code/huly-platform-wt/tools/ghci/pc-review-2026-10-26/mobile-tools
```
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
product revision. The legacy assertion reads the old missing plugin viewlets **after** authentication
and fixture readback have succeeded against the built frontend. Setup/browser/import failures, missing projects,
failed cleanup or missing artifacts are `invalid`, not valid red evidence. Individual baseline checks use
`--target baseline`. All five projects run by default, with retries disabled.

Artifacts are stored outside this repository under
`tools/ghci/pc-review-2026-10-26/out/mobile-1/mobile-evidence-*/{red,green}/`:
fixture-only masked PNGs, action-only traces, per-test results and assertion summaries. The combined
summary includes both deployment SHAs, checkout dirty state and a SHA-256 digest of the test sources.
Traces deliberately omit DOM snapshots, network, resources, console messages, source files and fill
arguments. Raw failure-context dumps are removed. These traces support action-order review; screenshots
supply the visual evidence. Treat `ui` plus independent `cleanup: ok` as the product acceptance contract.

## Live evidence review (2026-10-31)

Reviewed the original `mobile-evidence-dH63xl/green/summary.json`, all five action traces and the eight
fixture screenshots under the runner's `out/mobile-1/` directory, plus
`tools/mobile-survey/impl/task1-evidence/candidate.log`. The log only repeats `invalid`; it adds no
browser diagnostics. The original artifacts are preserved and have not been reclassified or rewritten.

| Project | Exact trace boundary and supported finding |
| --- | --- |
| chromium | All four desktop steps have UI assertions and screenshots: List, Board, Create/cancel, separate editors. Cleanup passes. |
| firefox | Same four successful desktop paths and screenshots; cleanup passes. |
| webkit | Each path checks Show Menu once, takes no click/tap branch, then fails visibility of `.antiPanel-navigator` (`call@25`, `39`, `47`, `55`). List recovery fails the `tab-all` count (`call@31`). No viewlet, Create or editor is attempted; no screenshot exists. |
| iphone-15 | Same boundary in portrait (`call@25`, `39`, `47`, `55`) and landscape (`65`, `79`, `87`, `95`). Both List recovery attempts fail the `tab-all` count (`31`, `71`). No menu tap, viewlet/Create/editor attempt or screenshot exists. |
| pixel-7 | Portrait paths and landscape List/Board/editors stop at navigator visibility (`call@25`, `45`, `53`, `61`, `71`, `91`, `109`). Landscape Create gets past navigator visibility but cannot find the fixture project (`call@101`), before any project tap. Both direct URL recoveries find the List fixture (`call@37`, `83`); neither is touch success. No screenshot exists. |

All five projects completed API fixture readback and verified cleanup. The old trace policy removes
visibility results, error detail, DOM, network, console and navigation URLs. Consequently these artifacts
cannot distinguish a WebKit reload/login/runtime failure from delayed shell readiness, nor prove a
phone navigator overlay interception. In particular, **no menu activation or intercepted target action
appears in any failed phone path**. Do not claim an established Create/Kanban product defect, or label
all phone failures as known navigator gaps, from these artifacts. The exact underlying browser state
requires a new instrumented run; the historical evidence remains incomplete.

The confirmed harness defect is its readiness race: `goto()` followed by an empty-overlay count can
succeed while the app is still loading. The immediate `ShowMenu.isVisible()` then skips opening the
menu permanently. The repaired harness waits for the authenticated menu control and content panel
before deciding whether to open it, scopes the primary navigator separately from a component
navigator, and sets testing/lazy-loading options with an init script before application imports.
Setup failures now carry a fixed phase/reason, and each failed step records its phase and a fixed
diagnostic reason without copying private error text. Traces retain a safe error category.

Only a failed real phone tap followed by a hit test proving that the floating navigator or its cover
occupies the target control qualifies as `known-product-gap`. It records the original named step,
phase, reason and a cropped, masked target screenshot. The reason refers to plan Tasks 2c/3 and states
that downstream Create/Kanban behavior remains untested. A timeout alone, a missing project/selector,
login/readiness failure or unexplained URL recovery remains a harness failure. Other product limitations
need their own demonstrated cause before this allowlist is extended.

Runner verdicts distinguish `green` (all UI paths), `green-with-known-gaps` (Task 1 reporting complete,
phone product coverage still missing), `red` (the authenticated legacy viewlet assertion only) and
`invalid` (harness/setup/cleanup/artifact failure). `knownProductGaps` and `harnessFailures` are separate
named lists; `productAcceptance` stays false when any gap exists. All four steps remain mandatory in
Chromium, Firefox and desktop WebKit. Both orientations and all four named steps remain mandatory on
phones. The runner verifies a trace per project and the expected screenshot for each UI/gap step;
aggregate screenshot counts cannot hide missing WebKit or phone evidence.

Verification of this revision runs in `/tmp/mobile-1-checks-fgqzm6uo` with existing dependencies linked
read-only: the offline contracts pass, including strict desktop requirements, named phone gaps,
missing gap images and mixed gap/harness failures through the full runner. Strict no-emit TypeScript
checking passes after the previously documented Faker compatibility adjustment **in the copy only**.
`navigation.spec.ts` adds synthetic browser regressions for delayed shell mounting, measured phone
interception and unrelated phone timeouts; it does not use a live lane. Browser execution was blocked
at launch by the sandbox (`sandbox_host_linux.cc`, socket operation not permitted), before assertions.
No new live acceptance result is claimed. Diagnostics and `rushx` are unavailable in this environment;
package build/validation and an instrumented five-project live rerun remain outstanding. No commit made.

To run the synthetic browser regressions with installed browsers, from `tests/sanity`:

```bash
npx --no-install playwright test -c tests/mobile-pwa.config.ts mobile/navigation.spec.ts --reporter=line
```

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
pass. The initial Task 1 implementation also compiled a readiness harness, removed by this review revision.
No browser was launched and no live
red/green evidence, Docker, stack, formatter, Rush build, package validation or commit was executed.
A diagnostics tool was not available. Live browser acceptance and lane validation remain pending.

Review revision: all eight offline contracts and the strict no-emit TypeScript check of both configs
and mobile sources passed in a temporary source copy with dependencies mounted read-only. With the
same temporary Faker compatibility adaptation, default Playwright discovery
listed 244 tests in 53 files with zero mobile specs; mobile discovery listed the survey once in each of
the five projects (5 tests in 1 file). The sanity copy exposed only its declared direct dependencies;
the runner resolved `fflate` separately from `mobile-tools`.
Rush 5.178.1 was not installed and `rushx` was unavailable, so package build/validation could not run.
The five removed dependency importer entries were deleted exactly; the rest of the lockfile matches
the pre-Task-1 version apart from the eight retained workspace dependency entries. No live UI was run.
Verification logs: `/tmp/mobile-1-review-vbszphuq/{contracts,default-list,mobile-list,typecheck}.log`.

Offline regression command after dependencies are installed:

```bash
MOBILE_PWA_REPO=/home/ai-agent/code/huly-platform-wt/pcfix-mobile-01 \
node /home/ai-agent/code/huly-platform-wt/tools/ghci/pc-review-2026-10-26/mobile-runner.test.mjs
```

`MOBILE_PWA_DEPS` can point to a separate existing dependency checkout for offline tests. It is not used
by live evidence: live tests resolve the source worktree's declared dependencies normally.
