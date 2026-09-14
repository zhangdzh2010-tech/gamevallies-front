# UI: theme split — dark landing, light product (2026-09-13)

## Decision
**Two palettes. Do not mix them.**

1. **Official H5 landing only** (`pages/landing/index`) is a **100% visual/structural replica** of the approved dark v2.2 draft at `docs/landing/zhile-landing-draft-v2.html`. Cinematic dark canvas, cyan CTAs, electric band, ice text, solid surfaces. **No frosted glass.** No draft / version watermark (`草箱 v2.2…`) in the runtime UI.
2. **Every other product page** (Creative Web, Creative Square, conversation, login, register, listed chrome) stays **light Jimeng**: airy white / off-white, charcoal type, soft gray lines, cyan reserved for CTAs.

PR #29 incorrectly painted the landing with the shared light tokens. Landing must not import or inherit `chrome-tokens.scss`.

Generated-work interiors stay on the educational paper pack from backend #90 (P4=A). No `backdrop-filter` frost, no purple neon.

## Landing (dark, self-contained)
Source of truth: `src/pages/landing/index.scss` (ported from the static draft). Taro chrome around the route is pinned in `src/app.scss` (`html.zl-landing-route` → `#0B1B36` plus the same blue/cyan atmosphere).

| Role | Value |
| --- | --- |
| Canvas / page | `#0B1B36` + radial band `#004DC8` / faint cyan wash (no frost) |
| Surface / cards / nav | `#111318` |
| Band | `#004DC8` |
| CTA | `#00CAE0` on `#1D2129` |
| Ice text | `#EBF8FF` / `#E0F5FF` |
| Muted | `#8BA3B8` |
| Line | `rgba(255,255,255,.12)` |
| Radius | 8–12px |

Structure (pixel-faithful): nav / hero + composer + demo card / electric band / ways / showcase / bottom CTA. H5 launch page is `pages/landing/index` (not a tab).

- Unauthenticated users can open the landing without login.
- `开启智了` → Creative Web home.
- `即刻创作` / `开始创作` → `openCreatePageWithAuth({ mode: 'fresh' })`.
- Static draft remains the approved visual reference. Re-port only if a later HTML arrives. Never ship the draft chip.

## Product chrome (light)
Source of truth: `src/styles/chrome-tokens.scss`, remapped through `src/styles/variables.scss` and `src/styles/creative-web-page.scss`.

| Role | Value |
| --- | --- |
| Canvas / page | `#F7F8FA` |
| Surface / cards / nav | `#FFFFFF` |
| Soft section band | `#F2F4F6` |
| CTA | `#00CAE0` on `#1D2129` |
| Ink | `#1D2129` / `#0F1419` |
| Muted | `#86909C` |
| Line | `rgba(29, 33, 41, .08)` |
| Cover matte | `#F0F2F5` |
| Radius | 8–12px |
| Card shadow | light, not glow |

## Creative Square cards
Gallery cards, not mini-players. The grid must never look like the work’s own paper chrome:

- 16:10 locked poster (`padding-top: 62.5%`). Landscape posters letterbox with `object-fit: contain`.
- Full-page work screenshots / `screenshot` fields / HTML dumps are not posters. If the only image is a tall document capture, show a clean abstract placeholder instead.
- Title once (1 line); author as a circular avatar + name. No description on the card.
- Remix / experience stay available but tucked (cover overlay on hover / focus-within; always visible on touch).
- `热门 · N` sits on the **cover**, never over title or author.
- Live sliders / start-pause / `WorkSandbox` iframes open only after 体验作品 → 开始体验 (dialog), never in the grid.

## What must not change
- HTML/CSS inside generated works (`WorkSandbox` iframe / educational paper).
- Cover and preview letterbox geometry (`object-fit: contain`, 16:10).
