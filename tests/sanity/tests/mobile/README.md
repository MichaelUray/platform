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

## Live diagnosis and harness correction (2026-10-31)

The live single-project runs used the existing `http://localhost:8083` stack, workspace `sanity-ws`,
account `user1`, and installed browsers/dependencies from `prprep2`. Changed test files were copied
from this worktree into that checkout for execution. No product code, build, Docker operation, browser
installation, Git branch change or commit was needed.

The latest historical evidence (`mobile-evidence-WqcdBL`) was reproduced with temporary structured
logging, raw action traces and screenshots. The causes are distinct:

- Desktop WebKit and iPhone 15 authenticate initially, but the account service's `PUT /cookie` response
  uses `Domain=localhost`. WebKit does not retain `account-metadata-Token`; the next full page load
  returns to login. Chromium retains that cookie. A controlled diagnostic forwarding the real response
  through Node fetch, with only this Domain attribute removed, retained WebKit login across reload;
  its unchanged-header control still lost login. The checked-in harness reports this local-stack
  authentication blocker without rewriting cookies. This finding does not establish a Create or
  Kanban defect, or a measured navigator obstruction.
- Pixel 7 fails the Create locator count: `#tracker-string-NewIssue` belongs to the desktop navigator
  action, which is unmounted after closing the floating navigator. The Issue view's primary header
  action remains available. The survey now activates that unique control inside `contentPanel`, then
  verifies the fixture project, title and description fields, cancels the empty form, and checks that
  no Issue was persisted. Both orientations exercise real taps.
- A live Firefox regression run exposed a post-cancel navigation race: `page.reload()` returned with
  `document.readyState === 'complete'`, but menu and content panel counts were both zero. Starting
  the next path could collide with workbench route restoration. The post-cancel load now uses
  `resetOverlays`, including authenticated workbench readiness, before the API persistence check and
  the next path.

Setup now verifies browser authentication across a full reload before creating synthetic fixtures.
Returning to login raises `BrowserSessionError` with a fixed diagnostic reason. Setup failures preserve
that original error through teardown, and cleanup is successful when no fixture client or writes existed.
The synthetic delayed-shell page also needs a nonzero navigator height to test actual visibility;
that fixture is repaired, and a lost-session regression covers the new diagnostic.

Final single-project outcomes with the product cookie response unchanged:

| Project | UI paths | Result |
| --- | --- | --- |
| chromium | 4/4 | Passed; cleanup verified. |
| firefox | 4/4 | Passed; cleanup verified. |
| pixel-7 | 8/8 | Passed in portrait and landscape; cleanup verified. |
| webkit | 0/4 | Blocked at persistent-authentication setup, before fixture writes. |
| iphone-15 | 0/8 | Same authentication blocker, before fixture writes. |

Evidence is under
`tools/ghci/pc-review-2026-10-26/out/mobile-1/mobile-live-20261031-013135/` outside this repository:
`verified/summary.json` holds final project results, and `diagnostics/` holds the reproduced failure
traces, login screenshots and cookie experiment findings. Historical evidence remains unchanged.
All 20 synthetic browser checks, all 10 offline runner contracts and strict no-emit TypeScript checking
passed with the installed dependencies. Three additional Firefox repeats passed all four UI paths and
verified cleanup. A diagnostics tool is unavailable; builds and formatting were
excluded by the live-debug task. Temporary logging is removed from the harness.

## Owner-approved WebKit session workaround (2026-10-31)

The owner approved a test-only workaround following `tools/ghci/uilib/huly.mjs`. This supersedes the
WebKit authentication blockers reported above. For the `webkit` and `iphone-15` projects only, the
fixture captures the Bearer token from the browser's actual `PUT /cookie` request during UI login.
If the authentication cookie is absent, it restores `account-metadata-Token` using
`context.addCookies` with the request origin as `url`, plus `httpOnly`, without a `domain` attribute.
The normal full-reload authentication check still runs before fixture writes. If a subsequent fresh
load returns to login, WebKit may re-login through the same UI page objects once and return to the
requested destination. Other browsers still fail a lost session normally.

Each `mobile-result.json` and the runner's `summary.json` results include a credential-free `session`
object: `workaround`, `logins`, `restores`, `restoreFailed`, and `uiRelogins`. Tokens and request headers
are never included in those results. The runner continues sanitizing traces and masking screenshots.

The first five-project live run passed all 28 paths: Chromium, Firefox and desktop WebKit 4/4 each;
iPhone 15 and Pixel 7 8/8 each, in portrait and landscape. WebKit and iPhone each restored one cookie;
the other projects restored none. No UI re-login was necessary, and cleanup passed for every project.
No phone product gap was measured. The 25 synthetic browser checks include capture/restoration,
WebKit UI re-login after cookie loss, and unchanged lost-session failure in the other engines.
All 10 offline runner contracts and strict no-emit TypeScript checking passed.

Final verification artifacts are stored outside the repository under
`tools/ghci/pc-review-2026-10-26/out/mobile-webkit-20261031-015459/`; the five-project runner summary
is in `mobile-1/mobile-evidence-*/green/summary.json`. `verification.json` records the source and
execution checkout revisions, matching source digests, validation results and session totals.
The stack's product is `pc/develop` as supplied by the operator; the served SHA is not independently
verified. The checkouts have different HEADs, so matching test sources are verified independently.
Changed harness files are copied to `prprep2` without switching either branch. No product change,
build, Docker operation, browser installation, formatting or commit is part of this verification.
The diagnostics tool is unavailable; no-emit TypeScript and browser checks provide validation.

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
