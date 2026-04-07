import * as gameService from '../services/game';

const GAME_TYPE_LABELS = Object.freeze({
  casual: '休闲',
  puzzle: '益智',
  education: '教育',
  funny: '趣味',
});

const FALLBACK_GAME_TYPE_OPTIONS = Object.freeze([
  { key: 'casual', label: GAME_TYPE_LABELS.casual },
  { key: 'puzzle', label: GAME_TYPE_LABELS.puzzle },
  { key: 'education', label: GAME_TYPE_LABELS.education },
  { key: 'funny', label: GAME_TYPE_LABELS.funny },
]);

let cachedGameTypeOptions = null;
let pendingGameTypeRequest = null;

function cloneGameTypeOptions(options) {
  return options.map((option) => ({ ...option }));
}

export function normalizeGameTypeKey(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return '';
  }

  if (['casual', 'leisure', 'relax', 'action', 'music', 'space', '休闲', '动作', '音乐', '太空'].includes(normalized)) {
    return 'casual';
  }

  if (['puzzle', 'brain', 'brain-teaser', '智力', '益智', '解谜', '拼图'].includes(normalized)) {
    return 'puzzle';
  }

  if (['education', 'educational', 'learning', 'learn', '教育', '启蒙', '知识'].includes(normalized)) {
    return 'education';
  }

  if (['funny', 'fun', 'humor', 'comedy', '趣味', '搞笑'].includes(normalized)) {
    return 'funny';
  }

  return normalized;
}

function normalizeGameTypeOption(option) {
  if (!option) {
    return null;
  }

  if (typeof option === 'string') {
    const key = normalizeGameTypeKey(option);
    if (!key) {
      return null;
    }

    return {
      key,
      label: GAME_TYPE_LABELS[key] || option,
    };
  }

  const key = normalizeGameTypeKey(
    option.type || option.value || option.key || option.id || option.code
  );

  if (!key) {
    return null;
  }

  const label = String(option.label || option.name || option.title || '').trim();

  return {
    key,
    label: label || GAME_TYPE_LABELS[key] || key,
  };
}

function dedupeGameTypeOptions(options) {
  const seen = new Set();
  return options.filter((option) => {
    if (!option?.key || seen.has(option.key)) {
      return false;
    }
    seen.add(option.key);
    return true;
  });
}

function extractGameTypeOptions(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.items)) {
    return response.items;
  }

  if (Array.isArray(response?.types)) {
    return response.types;
  }

  return [];
}

export function getFallbackGameTypeOptions() {
  return cloneGameTypeOptions(FALLBACK_GAME_TYPE_OPTIONS);
}

export function getDefaultGameTypeOptions() {
  if (cachedGameTypeOptions?.length) {
    return cloneGameTypeOptions(cachedGameTypeOptions);
  }

  return getFallbackGameTypeOptions();
}

export function buildGameTypeTabs(options = getDefaultGameTypeOptions()) {
  return [
    { key: 'all', label: '全部' },
    ...options.map((option) => ({ key: option.key, label: option.label })),
  ];
}

export function getGameTypeLabel(value, options = getDefaultGameTypeOptions()) {
  const key = normalizeGameTypeKey(value);
  if (!key) {
    return '';
  }

  const matchedOption = options.find((option) => option.key === key);
  if (matchedOption?.label) {
    return matchedOption.label;
  }

  return GAME_TYPE_LABELS[key] || key;
}

export async function fetchGameTypeOptions(forceRefresh = false) {
  if (!forceRefresh && cachedGameTypeOptions?.length) {
    return cloneGameTypeOptions(cachedGameTypeOptions);
  }

  if (!forceRefresh && pendingGameTypeRequest) {
    return pendingGameTypeRequest;
  }

  pendingGameTypeRequest = gameService.getGameTypes()
    .then((response) => {
      const options = dedupeGameTypeOptions(
        extractGameTypeOptions(response)
          .map(normalizeGameTypeOption)
          .filter(Boolean)
      );

      if (!options.length) {
        throw new Error('No game types returned');
      }

      cachedGameTypeOptions = options;
      return cloneGameTypeOptions(options);
    })
    .catch(() => {
      const fallbackOptions = getFallbackGameTypeOptions();
      cachedGameTypeOptions = fallbackOptions;
      return cloneGameTypeOptions(fallbackOptions);
    })
    .finally(() => {
      pendingGameTypeRequest = null;
    });

  return pendingGameTypeRequest;
}
