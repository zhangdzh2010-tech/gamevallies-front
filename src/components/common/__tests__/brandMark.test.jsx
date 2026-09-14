/* eslint-env jest */
import React from 'react';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';
import { BrandMarkImg } from '../BrandMark';

const brandDir = join(__dirname, '../../../assets/brand');
const staticDir = join(__dirname, '../../../static');
const html = readFileSync(join(__dirname, '../../../index.html'), 'utf8');
const config = readFileSync(join(__dirname, '../../../../config/index.js'), 'utf8');

test('authoritative square mark and H5 icon sizes exist', () => {
  expect(existsSync(join(brandDir, 'zl-mark.png'))).toBe(true);
  [
    'favicon.ico',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
    'android-chrome-192x192.png',
    'android-chrome-512x512.png',
    'site.webmanifest',
  ].forEach((name) => {
    expect(existsSync(join(staticDir, name))).toBe(true);
  });
});

test('H5 entry wires favicon, apple-touch, and copy-to-dist', () => {
  expect(html).toMatch(/rel="icon"[^>]+href="\/favicon\.ico"/);
  expect(html).toMatch(/favicon-32x32\.png/);
  expect(html).toMatch(/rel="apple-touch-icon"/);
  expect(html).toMatch(/site\.webmanifest/);
  expect(config).toMatch(/src\/static\/favicon\.ico/);
  expect(config).toMatch(/apple-touch-icon\.png/);
});

test('BrandMarkImg renders the bundled square mark', () => {
  const { container } = render(<BrandMarkImg className="zl-mark" />);
  const img = container.querySelector('img.zl-mark');
  expect(img).toBeTruthy();
  expect(img.getAttribute('src')).toBe('zl-mark.png');
});
