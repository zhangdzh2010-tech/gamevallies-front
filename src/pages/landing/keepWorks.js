// Curated KEEP showcase used when the public feed is empty or unavailable.
// TODO(feed): replace with a dedicated published-by-domain API when backend exposes
// physics/chemistry/biology/tool/game filters. Until then we try public feed
// endpoints (latest / featured / trending) and fall back to this list.

export const LANDING_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'physics', label: '物理' },
  { id: 'chemistry', label: '化学' },
  { id: 'biology', label: '生物' },
  { id: 'tool', label: '工具' },
  { id: 'game', label: '游戏' },
];

export const KEEP_WORKS = [
  {
    id: 'keep-pendulum',
    title: '小角度理想单摆演示',
    description: '调整摆长与重力，观察周期如何接近 2π√(L/g)。',
    author: '智了',
    domain: 'physics',
    domainLabel: '物理',
    coverLabel: '物理 · 单摆',
  },
  {
    id: 'keep-photosynthesis',
    title: '光合作 · 产氧可视化',
    description: '改变光照与二氧化碳，看产氧速率如何响应。',
    author: '智了',
    domain: 'biology',
    domainLabel: '生物',
    coverLabel: '生物 · 光合',
  },
  {
    id: 'keep-double-pendulum',
    title: '双摆轨迹如何分叉',
    description: '两个几乎相同的初始角度，轨迹会在何时分开。',
    author: '智了',
    domain: 'physics',
    domainLabel: '物理',
    coverLabel: '物理 · 双摆',
  },
  {
    id: 'keep-equilibrium',
    title: '可逆反应动态平衡',
    description: '调节正逆速率常数，观察浓度如何趋向平衡。',
    author: '智了',
    domain: 'chemistry',
    domainLabel: '化学',
    coverLabel: '化学 · 平衡',
  },
  {
    id: 'keep-unit-lab',
    title: '单位换算工作台',
    description: '把量纲和数量级摊开，让换算过程可检查。',
    author: '智了',
    domain: 'tool',
    domainLabel: '工具',
    coverLabel: '工具 · 换算',
  },
  {
    id: 'keep-orbit-play',
    title: '轨道弹珠台',
    description: '用引力井改写弹珠路径。游戏是可选形式，不是默认。',
    author: '智了',
    domain: 'game',
    domainLabel: '游戏',
    coverLabel: '游戏 · 轨道',
  },
];

const DOMAIN_ALIASES = {
  physics: ['physics', 'physical', 'motion', 'pendulum', '物理', '力学', '单摆', '双摆'],
  chemistry: ['chemistry', 'chemical', 'reaction', '化学', '反应', '分子'],
  biology: ['biology', 'life', 'bio', '生物', '光合', '细胞', '种群'],
  tool: ['tool', 'utility', 'calculator', '工具', '换算', '工作台'],
  game: ['game', 'play', 'arcade', '游戏', '弹珠'],
};

export function inferWorkDomain(work = {}) {
  const haystack = [
    work.domain,
    work.category,
    work.gameType,
    work.type,
    work.tag,
    ...(Array.isArray(work.tags) ? work.tags : []),
    work.title,
    work.description,
  ].filter(Boolean).join(' ').toLowerCase();

  return LANDING_FILTERS.slice(1).find((filter) => (
    DOMAIN_ALIASES[filter.id]?.some((alias) => haystack.includes(String(alias).toLowerCase()))
  ))?.id || 'tool';
}

export function landingAuthorName(work = {}) {
  const author = work.author;
  const candidates = [
    author?.displayName,
    author?.nickname,
    author?.username,
    work.authorName,
    typeof author === 'string' ? author : '',
  ];
  const hit = candidates.find((value) => typeof value === 'string' && value.trim());
  return hit ? hit.trim() : '创作者';
}

export function adaptPublicWork(work, index = 0) {
  const domain = inferWorkDomain(work);
  return {
    id: work.id || `public-${index}`,
    title: work.title || '未命名作品',
    description: work.description || '一个可以动手探索的交互实验。',
    author: landingAuthorName(work),
    domain,
    domainLabel: LANDING_FILTERS.find((item) => item.id === domain)?.label || '作品',
    coverLabel: LANDING_FILTERS.find((item) => item.id === domain)?.label || '作品',
    coverUrl: work.coverUrl || work.cover || work.thumbnail || '',
    playCount: work.plays || work.playCount || 0,
    source: 'api',
    raw: work,
  };
}

export function filterWorks(works, filterId) {
  if (!filterId || filterId === 'all') {
    return works;
  }
  return works.filter((work) => work.domain === filterId);
}

const PHOTO_MARKERS = /光合|photosynth|产氧|keep-photosynthesis/i;

export function isPhotosynthesisWork(work = {}) {
  const hay = [work.id, work.title, work.description, work.coverLabel]
    .filter(Boolean)
    .join(' ');
  return PHOTO_MARKERS.test(hay);
}

// Band card prefers a published cover, then the KEEP photosynthesis slot.
export function pickPhotosynthesisWork(works = []) {
  const matches = works.filter(isPhotosynthesisWork);
  return matches.find((work) => work.coverUrl) || matches[0] || null;
}
