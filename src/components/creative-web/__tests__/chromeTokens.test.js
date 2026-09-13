/* eslint-env jest */
import { readFileSync } from 'fs';
import { join } from 'path';
import conversationStyles from '../conversationStyles';

const scss = readFileSync(join(__dirname, '../creative-web.scss'), 'utf8');
const chrome = `${scss}\n${conversationStyles}`;

test('creative-web chrome stays solid: no frost, neon lime, or serif display type', () => {
  expect(chrome).not.toMatch(/backdrop-filter/i);
  expect(chrome).not.toMatch(/#c4f465/i);
  expect(chrome).not.toMatch(/Georgia/i);
  expect(scss).toMatch(/--cw-shadow:0 1PX 2PX.*,0 2PX 8PX/);
  expect(scss).toMatch(/\.cw-project \{[^}]*border-radius:10PX/);
  expect(scss).toMatch(/\.cw-dialog \{[^}]*border-radius:12PX/);
  expect(scss).toMatch(/\.cw-topbar \{[^}]*background:#fff/);
  expect(scss).toMatch(/\.cw-chip \{[^}]*border-radius:8PX/);
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
