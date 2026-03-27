export function isRenderableImageUrl(url) {
  if (typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith('data:image/')) {
    return true;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const pathname = (parsed.pathname || '').toLowerCase();

    // Reject obvious game entry pages or html documents accidentally used as cover images.
    if (pathname.endsWith('.html') || pathname.endsWith('.htm')) {
      return false;
    }
  } catch (_error) {
    return false;
  }

  return true;
}

export function getGameCoverUrl(game = {}, fallback = '') {
  const candidates = [
    game.coverUrl,
    game.thumbnailUrl,
    game.coverImage,
    game.thumbnail,
    game.screenshot,
    game.poster,
    game.imageUrl,
    game.image,
    fallback,
  ];

  return candidates.find((url) => isRenderableImageUrl(url)) || '';
}

export function getSafeGameImage(game = {}) {
  return getGameCoverUrl(game);
}
