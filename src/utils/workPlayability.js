function normalizeId(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

/** Curated landing KEEP slots are marketing cards, not real playable works. */
export function isPlayableWorkId(value) {
  const id = normalizeId(value);
  return Boolean(id) && !/^keep-/i.test(id);
}
