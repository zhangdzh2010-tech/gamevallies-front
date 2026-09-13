/* eslint-env jest */
import React from 'react';
import { render } from '@testing-library/react';
import { CoverMatte, PlayerLetterbox } from '../coverLetterbox';

test('cover matte contains the image so cards can letterbox instead of crop', () => {
  const { container } = render(<CoverMatte src="https://cdn.example/cover.png" alt="封面" />);
  const matte = container.querySelector('.cw-cover-matte');
  const img = matte.querySelector('img');
  expect(img.getAttribute('src')).toBe('https://cdn.example/cover.png');
  expect(img.getAttribute('alt')).toBe('封面');
});

test('player letterbox marks the stage for 16:10 contain scaling', () => {
  const { container } = render(<PlayerLetterbox className="cw-square-stage"><iframe title="work" /></PlayerLetterbox>);
  const stage = container.querySelector('.cw-player-letterbox.cw-player-letterbox--scaled.cw-square-stage');
  expect(stage).toBeTruthy();
  expect(stage.querySelector('iframe').getAttribute('title')).toBe('work');
});
