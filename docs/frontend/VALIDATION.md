# Frontend validation record

Status: **Complete for the assigned frontend scope**, subject to the explicitly untested real-wallet/live-transaction and publication behavior below. These are worker results, not independent network certification.

## Scope and assumptions

Implemented the approved WAKE cemetery and attested IMD/WAKE pool using Vite, React, TypeScript, wagmi, viem, and React Query. Source/build configuration/lockfile/tests are under `web/`; the actual static export is repository-root `dist/`; evidence and design documentation are under `docs/`. The overriding path restriction excludes root `DESIGN.md`, so the required implemented design document is `docs/DESIGN.md`. Protected contracts, ABIs at the deployed source, Foundry configuration, remappings, libraries, and root configuration were preserved.

The given seven-word hero is deliberately retained despite the generic six-word suggestion. All token/cemetery records come from chain reads; the only synthetic records exist inside browser/unit fixtures. Screenshot names beginning `mock-` explicitly identify those fixtures. No owner address, deployment address, RPC key, token ID, price, or user balance was invented for the production application. The post-launch unset WAKE address is handled as real contract state, not replaced with a stand-in.

## Final checks

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript + production build | Passed, Node 24.21.0 / npm 11.19.0 / Vite 8.3.4 | `npm --prefix web run build` includes `tsc --noEmit` |
| Unit/integration tests | **17 passed**, two files | `npm --prefix web run test`; `web/tests/core.test.ts`, `web/tests/reads.test.mjs` |
| Browser scenarios | **12 groups passed** | `docs/frontend/evidence/browser-results.json` |
| Chromium + WebKit main flow | Passed with mocked EIP-6963/RPC, no live writes | `web/tests/browser.mjs`; WebKit receipt screenshot |
| Automated accessibility | axe: zero violations in measured desktop entry state | Browser scenario “Mobile first screen…” |
| Pinned taste probe | **16/16 passed** | `docs/frontend/evidence/taste.json` |
| 320 / 390 / 1440 layout | No horizontal scroll, measured overlaps, or clipped text | Probe, screenshots, long-value browser checks |
| 390 first screen | Product, wallet, reward state, and main action present | `production-390.png`; main-button bounding box asserted below 844px |
| Static subpath | Actual export served under `/ipfs/wake/`; manifest, ABI, JS/CSS and local images resolve | Browser fixtures use no server rewrites |
| Runtime source binding | Both implementation-derived ABI canonical Keccak hashes match exact handoff | Build and `npm --prefix web run verify` |
| Manifest inventory | Exact top-level schema, exact contract set/pool/network/add-chain block, every other file SHA-256 covered | `web/scripts/deployment.mjs --check` |
| Live deployment reads | Ethereum chain 1, nonempty code at both handoff addresses | `live-rpc.json`; `live-read.txt` |
| Source/size/package hygiene | Audited separately in `submission.json` | No frontend dependency/cache/archive directories included |

The final export has 18 declared assets (plus its manifest), totaling 1,455,676 asset bytes. The largest asset is approximately 524 kB. This is below the 128-asset, 8 MiB/file, submission-size, and publication-response-budget limits. One Vite performance advisory reports a minified JS chunk over 500 kB; this is not a build failure. Coinbase's SDK is split into separate chunks. No source maps or dependency archives are included.

## Behavior exercised

- EIP-6963 named-wallet discovery, generic-row suppression, rejection with retry, successful connection, focus return, Escape close, account changes, wrong-chain disabled actions, and exact `wallet_addEthereumChain` fallback after 4902.
- Phone sheet at 390px: all four wallet-app links and Coinbase Smart Wallet, no relay/QR requirement; keyboard focus remains in the dialog.
- Read-only snapshot at one block, 101 consecrated tokens across 100-item pages, 6-decimal and 18-decimal token amounts, and owner/per-wallet/global state.
- Single burial through `bury` in WebKit. Multiple burial through `buryMany` in Chromium, full-balance exact approvals, rejected signature and recovery, receipt-derived 999.75 WAKE total from two sequential rewards, generated PNG download, and X share URL.
- 51-token “Bury all”: two separately confirmed transactions of 50 and 1; allowance gating and a fresh acknowledgment for the second batch.
- Approval stays disabled through receipt confirmation. The browser clock advances the 180-second confirmation timeout immediately, then retries the same hash without another transaction. This is a simulated timer, not a three-minute worker wait.
- First-mourner epitaph eligibility, 64 UTF-8 byte limit (including multibyte input), write success and disappearance of the one-time editor. Exact WAKE approval followed by a separate flowers burn.
- Owner-only one-time setup uses the attested WAKE address. Funding requires irreversible-deposit acknowledgment and exact allowance; consecration rejects duplicate addresses, then sends the pasted valid list.
- Both buy and sell: correct directional quote and exact handoff hook; ERC-20 approval to network Permit2, Permit2 approval to network Universal Router, zero ETH value, router command `0x10`; failed simulation sends no transaction, followed by successful retry. Invalid slippage invalidates the quote. Unit tests decode standard/extended tuple layouts, native-input value, settle/take currencies, minimum output, and exact hook preservation.
- Missing application code disables writes. Failed public reads fall back to a connected wallet's RPC on the correct chain. Network errors remain visible and recoverable.
- Very long token names, large balances, expanded full addresses, dialogs, 320/390 reflow, 200% text enlargement, and reduced motion. No side scrolling in measured cases.

## Live observations, without signing

At the final read, the browser reached `https://ethereum-rpc.publicnode.com`, returned chain ID 1, and saw 1,722 bytes of LaunchToken code and 7,814 bytes of Graveyard code. The UI reported verified public-RPC state with zero burials, zero WAKE in the reward vault, zero consecrated tokens, and WAKE setup still pending. This means the owner must perform the existing post-launch setup before real burials can be used. The frontend exposes that owner setup and informs other visitors; the worker did not initialize the contracts.

Initial Python HTTP requests to both configured RPC URLs returned 403. Browser requests subsequently worked. This distinction is recorded rather than treating the Python limitation as proof that runtime reads fail.

No real wallet was funded or asked to sign. No live burial, approval, swap, funding, consecration, epitaph, or flowers transaction was broadcast. The observed code/read results do not prove liquidity, transferability of every future consecrated token, gas affordability, or successful real-wallet signing.

## Better Interface: six-domain review

| Domain | Coverage and observed result | Limitations |
| --- | --- | --- |
| Accessibility | Checked semantic main/headings, skip link, labels, native dialog focus, Escape/return focus, persistent status/errors, focus ring, control spacing, reduced motion; axe zero measured violations | No screen reader, switch-control, forced-colors, or physical touch-device session |
| Layout | Checked first-screen task priority; responsive grids; 320/390/1440; full address, large balance and long-name stress; dialogs; enlarged text | Native browser zoom and RTL/localization are not verified; app copy is English |
| Writing | Reviewed irreversible consequences, exact approvals, partial-batch success, next-step errors, setup/empty/loading states, token units and missing USD context | No user study; exact brief headline is an intentional guideline exception |
| Typography | Probe found five sizes per viewport, two families, three weights, no clipped critical text or wide tracked labels; serif display stays largest/heaviest | System font glyphs vary by platform; no downloaded-font claim |
| Colors | Probe passed all measured text pairs; source token roles reviewed; selected measured ratios recorded in `docs/DESIGN.md` | No alternate theme; intended dark-only brief; no manual color-vision study |
| UI details | Walked pending, rejection, retry, success, empty/unconfigured, read failure, modal, sort/search controls; consistent SVG stroke/surface states; reduced motion stops fog | No 10%-speed animation-panel review or physical wallet-app transition test |

## Findings and repairs

| Severity / location | Finding | Repair and recheck |
| --- | --- | --- |
| Medium, `web/src/styles.css:278` | The original 14px header wallet control was classified by taste as a pill label immediately above the hero at 390px | Raised it to the existing 16px body role; final probe 16/16, first-screen control remains visible |
| High, `web/src/utils.ts:77` | A simulated contract revert's verbose RPC URL caused the generic HTTP matcher to hide the revert reason | Extract known errors/revert reasons before transport matching; a decoded simulation failure is shown and no write occurs; browser + regression test pass |
| High, `web/src/chain.ts:343` | A receipt timeout could release an action before its transaction outcome was known | Added a locked uncertainty state and same-hash confirmation retry; virtual-clock browser test proves one write throughout timeout/recovery |
| Medium, `web/src/Owner.tsx:29`, `web/src/Tomb.tsx:52` | A sufficient or externally changed allowance could make an “Approve” label lead to the spending action | Read actual allowance, label the current step, and stop to update the action if fresh allowance differs; owner/flowers tests pass |
| Medium, `web/src/Burial.tsx:65` | Failed allowance discovery could leave an incomplete review actionable | Added an explicit ready gate and Retry allowance checks; simulation/verification gates remain mandatory |
| Medium, `web/src/Wallet.tsx:7` | The supplied Rabby example omitted its actual dapp parameter form | Verified upstream handler and used `/mobile/?_cmd=open-dapp&dapp=…`; link encoding test passes; native-app transition remains untested |
| Medium, `web/src/chain.ts:191`, `web/src/Burial.tsx:190` | Scheduled large scans could overlap, and an account change while a receipt was pending could publish old-account share state | Scheduled scans skip an active scan; receipts refresh the latest wallet view; share callback checks the current account; account-change and 101-token tests pass |

No unresolved implementation blocker was observed. The first probe's wallet-label flag was a false-positive classification, but its small type was improved anyway. The guide's root-path request was resolved according to the assignment's stronger path restriction, not by modifying a protected root file.

## Worker commands and browser runtime

Final commands:

```sh
npm --prefix web run build
npm --prefix web run test
npm --prefix web run test:browser
npm --prefix web run verify
```

The browser command was run with `PLAYWRIGHT_BROWSERS_PATH=/tmp/wake-browsers`. Chromium 156 and WebKit 27.2 were installed there. Required Debian 13 WebKit/Mesa packages were downloaded/extracted under `/tmp/wake-webkit-libs`, and the temporary MiniBrowser launcher was pointed at those libraries. `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` skips Playwright's system-package-location check; the browser itself successfully launched and completed the test. The software EGL environment used `__EGL_VENDOR_LIBRARY_FILENAMES=/tmp/wake-webkit-libs/usr/share/glvnd/egl_vendor.d/50_mesa.json` and `LIBGL_DRIVERS_PATH=/tmp/wake-webkit-libs/usr/lib/x86_64-linux-gnu/dri`. None of that tool installation is shipped.

From the repository root, after the final build:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/wake-browsers \
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The raw final probe and selected screenshots are copied into `docs/frontend/evidence/`, because `test/scratch/` is removed before submission. Build/ABI verification is reproducible after the pinned inputs disappear using the preserved build inputs and pinned Git source. The taste probe itself remains an external pinned task input, not a new vendored tool.

## Remaining boundaries

- Extension/device-specific behavior, Coinbase passkey creation, the four native wallet-app links, fee-market behavior, transaction replacement/reorg behavior, and real swaps/burials are not end-to-end validated with live signatures. Replacement handling is implemented but not reproduced with a real wallet.
- Exact token approvals are used. Tokens with nonstandard approval rules or expensive/malicious execution may fail simulation; the UI reports that failure and permits smaller burial batches. It cannot guarantee every future ERC-20 behaves correctly.
- npm's dependency audit reports remaining moderate advisories in transitive wallet dependencies. The high `ws` advisory was removed with a compatible 8.x override. No claim of zero dependency advisories is made; audit details are summarized in `docs/frontend/evidence/dependency-audit.json`. Unused wallet connectors are not configured.
- OG image paths are relative for unknown IPFS hosting. The PNG is valid and local; absolute domain metadata awaits publication.
- Hosting, pinning, named-entrypoint checks, and immutable-CID validation are subsequent control-plane work. None is claimed as a worker result.

Git metadata in the assigned workspace is read-only (`os.access('.git', os.W_OK)` returned false). The permitted source/export/documentation files are therefore delivered in the working tree for the contributor submission collector; no claim is made that the worker wrote a commit in this checkout. The bundle-size check uses a temporary local clone containing the exact prospective files and all existing history.
