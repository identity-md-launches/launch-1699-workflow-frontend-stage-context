# WAKE Graveyard frontend

A static React/TypeScript interface for the deployed WAKE and Graveyard contracts. The app discovers a wallet's eligible consecrated tokens, previews declining rewards, executes full-balance burials, and displays the cemetery. It includes epitaphs, flowers, owner setup/funding/consecration, and the attested IMD/WAKE Uniswap v4 pool.

## Install, build, preview

Use Node 22.12+ (validated with Node 24.21.0 and npm 11.19.0).

```sh
cd web
npm ci
npm run typecheck
npm run build
npm run preview
```

`npm run build` runs TypeScript, exports Vite to repository-root `dist/`, then emits `dist/imd-deployment.json`. Preview serves the completed export, including its deployment manifest. Open the printed localhost URL. The Vite `base` is `./`; all assets and manifest/ABI fetches work below a gateway subpath without server rewrites. Tombstone URLs use `#tomb/<address>`.

For development, build once and use `npm run dev` for hot reload after copying the generated `dist/imd-deployment.json` and `dist/abi/` into `web/public/` temporarily. Remove those development copies before a final build: the export script owns the final ABI files and manifest. The committed production export does not need a rebuild or backend to serve.

## One runtime configuration

`src/config.ts` fetches **the exported `imd-deployment.json`** and its ABI paths. Contract addresses, chain, RPCs, the complete pool key, Uniswap addresses, and add-chain parameters all come from that file. There is no separate address/ABI map in application source. Runtime ABI arrays are checked against their canonical Keccak bindings before wallets and actions initialize.

The two files in `web/deployment/` are preserved build inputs, copied from the pinned handoff and network table. They are not imported into the browser. `scripts/deployment.mjs` compares them with the pinned inputs when those inputs are present. It obtains each ABI with `git show <sourceCommit>:docs/abi/<name>.json`, compares the local documentation ABI byte-for-byte, verifies canonical Keccak (recursively sorted object keys, array order preserved), then exports the original array bytes. Rebuilding needs the deployed source commit in Git history, so use a full clone or fetch that commit when using a shallow clone.

The generated manifest contains only the allowed keys and the exact handoff contract set. Its SHA-256 inventory covers every exported file except the manifest itself. `npm run verify` rechecks source binding, complete inventory, hashes, and size limits without modifying files. Run it after any export change. To intentionally change a deployment, obtain a new attested handoff and vetted network table; do not edit an address in a component.

No private keys, private RPC credentials, relay, WalletConnect project ID, backend, or environment file are needed.

## Wallets and reads

- wagmi discovers desktop extensions through EIP-6963. Generic injection is labeled “Browser wallet” and hidden when named extensions are available.
- A phone without an injected wallet gets MetaMask, Coinbase Wallet, Rabby, and Phantom open-in links, plus Coinbase Smart Wallet. Coinbase uses the bundled SDK connector. No relay connector is configured.
- Connect attempts to switch chains. Error 4902/unknown-chain errors lead to the exact `walletAddChain` request and another switch. Wrong-network transaction controls remain disabled.
- Public RPCs are tried in manifest order. On the correct chain, the connected wallet's RPC is a fallback. Chain ID and nonempty application code must be verified before writes.
- Snapshots read one block, page all consecrated tokens in groups of 100, and inspect six tokens concurrently. A bad token metadata/balance read does not hide other tokens. Unknown decimals are never assumed for a burial.
- Visible pages refresh every 30 seconds without overlapping scheduled scans; receipts and Refresh request another snapshot. The deployment disclosure shows block, update time, connection source, vault, totals, and exact pool key.

## Transaction behavior

Burial review shows each full token balance, contract address, sequential reward estimate, permanent-loss acknowledgment, and exact approval steps. `bury` is used for a single selected token. “Bury all” uses `buryMany` in separately reviewed batches of up to 50; the visitor may reduce that to 10 or 1 for expensive tokens. Balances and allowances are read again before action. A failed later batch cannot undo an earlier confirmed one. Zero rewards are explicitly described and still consume burial rights.

Every write is simulated, then signed by the visitor, then held pending until a receipt and state refresh. A confirmation timeout keeps the action locked and offers “Check confirmation” for the same hash. Repriced transactions can continue; a different replacement is not credited as the intended action. Wallet/account changes are checked before signing. Status includes the explorer transaction link. Known contract errors and rejection messages are translated into actionable text.

Only confirmed matching `Buried` receipt events count toward the generated PNG and X share text. Share state belongs to this visit and resets when the account changes; it is not a global off-chain history. The first mourner can write one epitaph, limited to 64 UTF-8 bytes. Flowers explicitly burn WAKE with an exact approval step. The owner can bind only the handoff's WAKE address in the UI, fund rewards irreversibly, and append validated token addresses.

Swaps quote `quoteExactInputSingle` through `eth_call` simulation. Token spending has two distinct, exact steps: ERC-20 approval to manifest Permit2, then Permit2 approval for manifest Universal Router, expiring after one hour. Quotes last 60 seconds. Slippage is 0.01–5%, default 0.50%; minimum output uses integer arithmetic. Execution uses command `0x10`, actions `0x060c0f`, the unchanged pool key/hook, and a ten-minute on-chain deadline. ERC-20 pairs send no ETH value. The native-currency and extended-parameter variants are also implemented and unit-tested, although this launch uses the IMD pair. No USD source was provided, so the interface reports token units and says USD context is unavailable.

## Validation

```sh
cd web
npm run test
npx playwright install chromium webkit
npm run test:browser
npm run verify
```

The browser test script owns its local server and closes it when finished. It serves the actual `dist/` at `/ipfs/wake/`. Synthetic EIP-6963 and RPC fixtures are isolated in `web/tests/`; they never enter the production bundle. Browser evidence is written under `docs/frontend/evidence/`. One explicitly unmocked test performs read-only deployment verification. **No live transaction is broadcast.**

On Linux, install Playwright's OS dependencies using the appropriate package-management workflow. This worker instead downloaded/extracted them under `/tmp/`, including Mesa software rendering, because root files are protected. The exact worker environment and limitations are in [validation](../docs/frontend/VALIDATION.md).

The pinned `taste.mjs` probe was run from the repository root against the final export at 320, 390, and 1440 pixels. Its original scratch outputs are disposable; durable results and selected screenshots are under `docs/frontend/evidence/`.

See [design system](../docs/DESIGN.md), [validation and coverage](../docs/frontend/VALIDATION.md), and [third-party notices](../docs/frontend/THIRD_PARTY.md). `docs/DESIGN.md` is intentionally inside the permitted documentation scope; the assignment's overriding path budget excludes a repository-root `DESIGN.md`.

## Delivery boundaries

Source, lockfile, build configuration, and tests live under `web/`; the static export is `dist/`; documentation and selected evidence are under `docs/`. The explicitly allowed `web/.gitignore` excludes dependency/cache/test-output directories at any depth. No node_modules, npm archive, vendored registry, submodule, root build change, or redeployment is part of this delivery. Hosting, immutable CID validation, and named-site publication happen after the worker submission.
