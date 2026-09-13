# UI: Jimeng light chrome (2026-09-13)

## Decision
Marketing landing and Creative Web (especially Creative Square) use a **light Jimeng** system: airy white / off-white surfaces, charcoal type, soft gray lines, and cyan (`#00CAE0`) reserved for CTAs. This **replaces** the dark cyan-tech shell (`#060C20` / `#111318`) that shipped earlier the same day.

Generated-work interiors stay on the educational paper pack from backend #90 (P4=A). No `backdrop-filter` frost, no purple neon, no draft / version watermarks on the live landing.

## Tokens
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

## Landing
H5 launch page is `pages/landing/index` (not a tab). Structure still follows `docs/landing/zhile-landing-draft-v2.html` (hero / band / ways / showcase / bottom), but the **live palette is light**. The static HTML remains a historical structure draft (dark v2.2); do not port its draft chip (`草箱 v2.2…`) into production.

- Unauthenticated users can open the landing without login.
- `开启智了` → Creative Web home.
- `即刻创作` / `开始创作` → `openCreatePageWithAuth({ mode: 'fresh' })`.

## Creative Square cards
Gallery cards, not mini-players:

- 16:10 cover / thumbnail, `object-fit: contain` letterbox.
- Title 1 line; description 2 lines; author; primary **体验作品**.
- `热门 · N` sits on the **cover**, never over title/description.
- Live sliders / start-pause / work iframes open only after 体验作品 (dialog), never in the grid.

## What must not change
- HTML/CSS inside generated works (`WorkSandbox` iframe / educational paper).
- Cover and preview letterbox geometry (`object-fit: contain`, 16:10).
