# WAKE design system

This document is placed under `docs/` because the assignment's overriding write budget forbids a repository-root `DESIGN.md`. It describes the implemented source, not a proposed redesign.

## Overview

WAKE is a cemetery for dead tokens: visitors review full-balance burns, receive declining WAKE rewards, and leave epitaphs or flowers. The requested direction is quiet, midnight blue, moonlit silver, and candle gold. A restrained line-drawn cemetery carries that idea; there are no horror effects or fabricated tombstone records.

The main hierarchy is product → personal burial control → live totals → cemetery → trading → explanation → owner settings. On a phone the product, wallet button, next-reward state, and main control fit the first 390px-wide screen. At desktop widths, the title and illustration sit beside the personal burial panel.

## Colors

Canonical tokens are at `web/src/styles.css:1`, using sRGB hex values.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#0b1421` | Midnight page and primary-button text |
| `--surface` | `#111e2e` | Burial panel, tombstones, forms, dialogs |
| `--raised` | `#172638` | Hover, selected segments, transaction status |
| `--text` | `#e6e9ed` | Moonlit primary text |
| `--muted` | `#a7b2c1` | Supporting copy and read status |
| `--gold` | `#d8bd87` | Primary action, icon detail, title emphasis |
| `--gold-hover` | `#ead2a3` | Primary-action hover |
| `--border` | `#35465a` | Structure and input boundaries |
| `--error` | `#f4afa9` | Error/setup notices, always accompanied by text |
| `--success` | `#a3cbb8` | Verified dot and confirmed status, with text |
| `--focus` | `#f0d6a5` | Two-pixel keyboard ring, four-pixel offset |

The theme is intentionally dark, per the brief. There is no nonfunctional theme switch. Gold fill identifies the main action in a local flow; secondary controls use surface fills and borders.

The rendered taste probe measured headline text/page at 15.18:1, gold headline/page and primary-button text/gold at 10.16:1, task summary/surface at 7.83:1, and setup notice/surface at 9.25:1. All measured text passed the probe's 4.5:1 normal / 3:1 large thresholds. These are observations of this export, not a blanket accessibility certification.

## Typography

- Display and headings: `Georgia, 'Times New Roman', serif`; body and controls: `Arial, Helvetica, sans-serif`. System fonts avoid external font requests. Actual glyphs vary by OS fallback.
- Roles: `--small` 14px; `--body` 16px; `--lead` 20px; `--section` 28px; `--display` 64px. The mobile display is 40px. At each tested width only five sizes were in use.
- Weights: 400 regular, 600 control/strong emphasis, 700 headline and its italic gold phrase. The headline is the heaviest text. The browser renders the corresponding installed font/fallback; no downloadable fonts are claimed.
- Body line-height 1.55. Main headline 1.05 (1.1 at the intermediate breakpoint), section headings 1.2, small headings 1.3. Longer epitaphs use 1.5.
- Main headline tracking −0.045em; section tracking −0.015em; body tracking is natural. No uppercase kicker labels.
- Prose is capped at 65ch. Amounts use tabular numerals and wrap rather than shrink. Full addresses are exposed in explorer/copy components; only the header account uses an abbreviated address, with the full address in its wallet dialog.

The exact seven-word headline, “A funeral for every dead token.”, is retained from the approved brief; it takes precedence over the reference's six-word marketing guideline.

## Layout

`web/src/styles.css` defines an eight-pixel spacing basis, normally 8–12px within groups and 24–64px between groups. The site is at most 1280px, with 48px desktop side padding, 32px below 1000px, 20px below 700px, and 16px below 400px.

- Above 1000px: two-column hero, three-column cemetery, two-column trading/owner areas, four-step explanation in four columns.
- Below 1000px: tighter hero gap and 40px title; explanation becomes two columns.
- Below 700px: one-column hero and trade; nav links disappear while wallet access remains; the decorative scene is removed to keep the task visible. Totals use two columns, tombstones two, owner forms one, footer one.
- Below 400px: tombstones and explanation become one column; cemetery tools wrap. Header and inputs stay within the page margins.
- Wallet dialogs become bottom sheets below 700px. Other dialogs retain inset margins and scroll vertically within `100dvh`. No fixed bar covers the page's main action.

The export was checked at 320, 390, and 1440px. Long names, very large balances, expanded full addresses, and 200% text enlargement were also checked without horizontal overflow. Text enlargement is not claimed as browser-native 200% zoom.

## Elevation & depth

The interface uses tonal surfaces and structural borders, without card shadows. `Modal` uses a dark translucent backdrop with a five-pixel blur; native `<dialog>` places it in the browser's top layer. The decorative fog is a low-opacity radial gradient behind the line illustration, not a text background.

## Shapes

Shared controls use an 8px radius, major panels 16px, and phone wallet sheets 20px at the upper corners. Tombstones use a 120px arched top and 8px lower corners. Those arches belong to cemetery records; do not apply them to ordinary forms. Critical text is never clipped to the decorative arch.

## Components

| Component or pattern | Source | Behavior |
| --- | --- | --- |
| `Wallet` | `web/src/Wallet.tsx` | One header connect control; named EIP-6963 rows, four mobile open links, Coinbase; pending/rejected/switch/add-chain/disconnect states |
| `Modal` | `web/src/ui.tsx:46` | Native modal semantics and focus containment; Escape, backdrop, close button; return focus; body scroll lock |
| `AddressLink` | `web/src/ui.tsx:106` | Full checksummed explorer link and copy action, visible copy feedback/fallback |
| `TxStatus` / `FieldError` | `web/src/ui.tsx:144` | Persistent progress with explorer hash; polite status and alert errors; confirmation retry without resend |
| `.primary` / `.button` | `web/src/styles.css` | 46px minimum control height; explicit rest, hover, pressed, focus, disabled states |
| `Burial` | `web/src/Burial.tsx:46` | Exact balance review, approval sequence, permanent-loss acknowledgment, 50/10/1 batch sizing, partial success and retry |
| `Tomb` / `.tombstone` | `web/src/Tomb.tsx`, `web/src/styles.css:491` | Sorted tombstone entry and hash-linked dialog; flower amount and first-mourner epitaph form |
| `Swap` | `web/src/Swap.tsx` | Direction segment, labeled amounts/slippage, quote, minimum received, allowances, simulated execution |
| `Owner` | `web/src/Owner.tsx` | Conditional owner controls; unset configuration has explicit setup copy |
| `ShareCard` | `web/src/Burial.tsx:332` | Canvas-generated PNG and X link, using confirmed receipt totals |
| `Icon` / `Scene` | `web/src/ui.tsx` | One authored outline SVG language, 1.5px stroke; decorative shapes are hidden from assistive technology |

Wallet marks come from the pinned connector reference and RainbowKit, with their original colors. Every form control has a label. Input validation uses visible persistent messages; required chain/verification/authorization gates use native disabled controls with nearby explanations.

Fog moves on an 18-second alternating cycle only when reduced motion is not requested, and has a visible pause control in the footer. Button feedback names only changed properties, lasts 150ms, and uses a 0.96 pressed scale. Reduced motion disables the endless animation and smooth scrolling.

## Do's and don'ts

- Start new sections with the existing `.section-heading`, spacing, and type roles. Reuse the ordinary outlined/surface button for secondary actions.
- Show unavailable/loading/empty chain data explicitly. Do not draw illustrative tombstones as if they were on-chain records.
- Preserve token decimals and complete addresses in a review. Do not use floating-point math for transaction amounts or trim critical values to fit.
- Use the deployment runtime and transaction hook. An action belongs behind wallet, correct-chain, code-verification, and contract-specific eligibility gates.
- Keep the main phone action above the supporting explanation. Place irreversible consequences beside the control.
- Reuse native `Modal` for a new detail flow; test keyboard focus and long content at 320px. Do not introduce another modal library or parallel color/type system for one component.

See `docs/frontend/VALIDATION.md` for observed findings, fixes, coverage, and remaining manual/device limitations.
