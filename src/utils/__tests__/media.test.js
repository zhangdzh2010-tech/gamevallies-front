/* eslint-env jest */
import { getGameCoverUrl, getSafeGameImage } from '../media';

describe('media cover helpers', () => {
  test('prefers coverUrl when both cover and thumbnail are available', () => {
    expect(getGameCoverUrl({
      coverUrl: 'https://img.example/cover.png',
      thumbnailUrl: 'https://img.example/thumb.png',
    })).toBe('https://img.example/cover.png');
  });

  test('falls back to thumbnailUrl when coverUrl is not a renderable image', () => {
    expect(getGameCoverUrl({
      coverUrl: 'https://game.example/play.html',
      thumbnailUrl: 'https://img.example/thumb.png',
    })).toBe('https://img.example/thumb.png');
  });

  test('accepts an explicit fallback string for non-game context objects', () => {
    expect(getGameCoverUrl({}, 'https://img.example/fallback.png')).toBe(
      'https://img.example/fallback.png'
    );
  });

  test('getSafeGameImage stays aligned with the cover helper', () => {
    const game = {
      coverUrl: '',
      thumbnailUrl: 'https://img.example/thumb.png',
    };

    expect(getSafeGameImage(game)).toBe(getGameCoverUrl(game));
  });
});
