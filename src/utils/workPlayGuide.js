const PLAY_GUIDE_FIELDS = [
  'playGuide',
  'play_guide',
  'playInstructions',
  'howto',
  'howTo',
  'how_to',
  'instructions',
  'instruction',
  'description',
];

export const EMPTY_PLAY_GUIDE = '作者暂未填写玩法说明';

function firstGuideText(source) {
  if (!source || typeof source !== 'object') {
    return '';
  }
  for (const field of PLAY_GUIDE_FIELDS) {
    const value = source[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

/** Resolve howto copy from existing work / play payload fields. No new backend field. */
export function getWorkPlayGuide(work, extras) {
  const text = firstGuideText(extras) || firstGuideText(work);
  return {
    text: text || EMPTY_PLAY_GUIDE,
    empty: !text,
  };
}
