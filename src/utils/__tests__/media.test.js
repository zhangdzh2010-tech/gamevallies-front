/* eslint-env jest */
import { getGameCoverUrl, getGalleryPosterUrl, getSafeGameImage } from '../media';

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

  test('accepts backend relative cover urls as-is', () => {
    expect(getGameCoverUrl({
      coverUrl: '/covers/game-1.png?taskId=task-1&previewToken=token-1',
      thumbnailUrl: 'https://img.example/thumb.png',
    })).toBe('/covers/game-1.png?taskId=task-1&previewToken=token-1');
  });

  test('accepts an explicit fallback string for non-game context objects', () => {
    expect(getGameCoverUrl({}, 'https://img.example/fallback.png')).toBe(
      'https://img.example/fallback.png'
    );
  });

  test('gallery posters skip screenshots and html dumps so cards never show work chrome', () => {
    expect(getGalleryPosterUrl({
      screenshot: 'https://img.example/full-screenshot.png',
      coverUrl: 'https://game.example/play.html',
      poster: 'https://img.example/poster.png',
    })).toBe('https://img.example/poster.png');
    expect(getGalleryPosterUrl({
      screenshot: 'https://img.example/capture.png',
      coverUrl: 'https://img.example/work-screenshot.png',
    })).toBe('');
  });

  test('getSafeGameImage stays aligned with the cover helper', () => {
    const game = {
      coverUrl: '',
      thumbnailUrl: 'https://img.example/thumb.png',
    };

    expect(getSafeGameImage(game)).toBe(getGameCoverUrl(game));
  });
});
