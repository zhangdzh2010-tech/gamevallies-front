/* eslint-env jest */
import { readFileSync } from 'fs';
import { join } from 'path';
import conversationStyles from '../conversationStyles';

const scss = readFileSync(join(__dirname, '../creative-web.scss'), 'utf8');
const pageTheme = readFileSync(join(__dirname, '../../../styles/creative-web-page.scss'), 'utf8');
const chromeTokens = readFileSync(join(__dirname, '../../../styles/chrome-tokens.scss'), 'utf8');
const chrome = `${scss}\n${conversationStyles}\n${pageTheme}\n${chromeTokens}`;

test('shared chrome tokens stay light for non-landing product pages', () => {
  expect(chromeTokens).toMatch(/\$chrome-bg: #F7F8FA/);
  expect(chromeTokens).toMatch(/\$chrome-surface: #FFFFFF/);
  expect(chromeTokens).toMatch(/\$chrome-band: #F2F4F6/);
  expect(chromeTokens).toMatch(/\$chrome-cta: #00CAE0/);
  expect(chromeTokens).toMatch(/\$chrome-cta-ink: #1D2129/);
  expect(chromeTokens).toMatch(/\$chrome-ice: #1D2129/);
  expect(chromeTokens).toMatch(/\$chrome-line: rgba\(29, 33, 41, 0\.08\)/);
  expect(chromeTokens).not.toMatch(/\$chrome-bg: #060C20/);
});

test('creative-web chrome stays solid light: no frost, neon lime, or purple', () => {
  expect(chrome).not.toMatch(/backdrop-filter/i);
  expect(chrome).not.toMatch(/#c4f465/i);
  expect(chrome).not.toMatch(/#6e56ff/i);
  expect(chrome).not.toMatch(/Georgia/i);
  expect(scss).toMatch(/--cw-shadow:0 1PX 2PX.*,0 8PX 24PX/);
  expect(scss).toMatch(/\.cw-project \{[^}]*border-radius:10PX/);
  expect(scss).toMatch(/\.cw-dialog \{[^}]*border-radius:12PX/);
  expect(scss).toMatch(/\.cw-topbar \{[^}]*background:#FFFFFF/);
  expect(scss).toMatch(/\.cw-chip \{[^}]*border-radius:8PX/);
  expect(scss).toMatch(/background:#F7F8FA/);
  expect(scss).toMatch(/#00CAE0/);
  expect(scss).not.toMatch(/#060C20/);
});

test('letterbox contain geometry from the plaza/studio preview PR is still present', () => {
  expect(scss).toMatch(/\.cw-cover \{aspect-ratio:16\/10/);
  expect(scss).toMatch(/padding-top:62\.5%/);
  expect(scss).toMatch(/object-fit:contain;object-position:center/);
  expect(scss).toMatch(/\.cw-player-letterbox \{/);
  expect(scss).toMatch(/aspect-ratio:16\/10/);
  expect(scss).toMatch(/max-height:min\(70dvh,760PX\)/);
  expect(scss).toMatch(/\.cw-preview-frame \{[^}]*aspect-ratio:16\/10/);
  expect(scss).toMatch(/\.cw-preview-wrap \{[^}]*max-height:min\(72dvh,820PX\)/);
});

test('square cards pin the hot badge to the cover and clamp title/description', () => {
  expect(scss).toMatch(/\.cw-gallery-cover \{[^}]*padding-top:62\.5%/);
  expect(scss).toMatch(/\.cw-gallery-cover \.cw-hot-badge \{[^}]*top:12PX/);
  expect(scss).toMatch(/\.cw-gallery-meta h3 \{[^}]*white-space:nowrap/);
  expect(scss).toMatch(/\.cw-gallery-meta p \{[^}]*-webkit-line-clamp:2/);
  expect(scss).toMatch(/\.cw-square-card \.cw-gallery-meta \.cw-hot-badge \{display:none;\}/);
  expect(scss).toMatch(/\.cw-square-card iframe/);
  expect(scss).toMatch(/\.cw-hot-badge[\s\S]*pointer-events: none/);
});
