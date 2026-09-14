# UI: cyan-tech chrome (2026-09-13) — landing tokens live on the marketing page

> **Theme split (corrected after PR #29).** The official H5 landing keeps this dark cyan-tech palette as a 100% replica of `docs/landing/zhile-landing-draft-v2.html`. Creative Web / Square / other product pages use light Jimeng — see [ui-jimeng-light-chrome-20260913.md](ui-jimeng-light-chrome-20260913.md). Shared `chrome-tokens.scss` is light and must not drive the landing.

## Decision
Official **landing** uses a jimeng-inspired dark cyan-blue system. Generated-work interiors stay on the educational paper pack from backend #90 (P4=A). No large `backdrop-filter` frost on nav, composer, cards, or tab bars. No purple neon. Runtime landing must not show the draft chip (`草箱 v2.2…`).

## Tokens (landing only)
Source of truth: `src/pages/landing/index.scss` (self-contained; not `chrome-tokens.scss`).

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
- Static draft (approved v2.2): `docs/landing/zhile-landing-draft-v2.html` (`docs/landing/index.html` redirects to it).

## What must not change
- HTML/CSS inside generated works (`WorkSandbox` iframe / educational paper).
- Cover and preview letterbox geometry.
- Light product chrome on non-landing pages.

## Follow-ups
- Replace KEEP showcase with a published-by-domain API when backend exposes physics/chemistry/biology/tool/game filters. The v2.2 draft is already committed; re-port only if a later HTML arrives.
