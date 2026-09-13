# UI: cyan-tech chrome (2026-09-13)

## Decision
Product **shell** (H5 marketing + Creative Web + listed chrome) uses a jimeng-inspired dark cyan-blue system. Generated-work interiors stay on the educational paper pack from backend #90 (P4=A). No large `backdrop-filter` frost on nav, composer, cards, or tab bars. No purple neon.

## Tokens
Source of truth: `src/styles/chrome-tokens.scss`, remapped through `src/styles/variables.scss` and `src/styles/creative-web-page.scss`.

| Role | Value |
| --- | --- |
| Canvas / page | `#060C20` |
| Surface / cards / nav | `#111318` |
| Band | `#004DC8` |
| CTA | `#00CAE0` on `#1D2129` |
| Ice text | `#EBF8FF` / `#E0F5FF` |
| Line | `rgba(255,255,255,.12)` |
| Radius | 8–12px |

## Routing
H5 launch page is `pages/landing/index` (not a tab). Weapp still launches `pages/index/index`.

- Unauthenticated users can open the landing without login.
- `开启智了` → Creative Web home (`/pages/index/index` → `CreativeHome`).
- `即刻创作` / `开始创作` → `openCreatePageWithAuth({ mode: 'fresh' })`.
- Static draft: `docs/landing/index.html`.

## What changed
- **A** Shared tokens.
- **B** Marketing landing + KEEP/public-feed showcase.
- **C** Creative Web / conversation **chrome** only. Letterbox / `object-fit: contain` from PR #25/#26 unchanged. Work iframe interiors unchanged.
- **D/E** Login/register, AppTopBar, CustomTabBar, GamePlayer, generation/task panels, CreationSession chrome, play/web-shell/detail/profile overlays, LegacyHome copy (`AI 游戏工坊` → `智了空间`).

## What must not change
- HTML/CSS inside generated works (`WorkSandbox` iframe / educational paper).
- Cover and preview letterbox geometry.

## Follow-ups
- Replace KEEP showcase with a published-by-domain API when backend exposes physics/chemistry/biology/tool/game filters.
- Port any later static landing HTML from `docs/landing/` if a newer draft arrives.
