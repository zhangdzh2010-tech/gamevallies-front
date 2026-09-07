export const CREATIVE_DOMAINS = [
  { id: 'open', title: '自由创意', label: 'OPEN EXPLORATION', description: '把一个想法变成可以探索的世界', prompt: '我想把一个有趣的想法做成可交互的作品，让体验者通过操作发现变化。' },
  { id: 'physics', title: '物理规律', label: 'PHYSICS / MOTION', description: '让看不见的力，变成看得见的变化', prompt: '做一个双摆交互实验，可以调整摆长、重力和初始角度，对比两组接近的初始条件，观察轨迹如何逐渐分离。' },
  { id: 'biology', title: '生物世界', label: 'BIOLOGY / LIFE', description: '从微小个体，观察生命的复杂秩序', prompt: '做一个捕食者与猎物的种群变化模型，可以调整繁殖率和捕食率，观察种群曲线，并解释模型假设。' },
  { id: 'chemistry', title: '化学反应', label: 'CHEMISTRY / CHANGE', description: '改变一个条件，探索反应的另一种可能', prompt: '做一个可逆反应的动态示意模型，可以调整初始浓度和正逆反应速率常数，观察两种粒子及浓度曲线如何趋向动态平衡。' },
  { id: 'art', title: '艺术与想象', label: 'ART / EXPRESSION', description: '用色彩、声音和互动，表达独特的想象', prompt: '做一个可以用鼠标创造涟漪的交互艺术作品，波纹相互叠加，颜色随速度变化，可以暂停观察。' },
];
export const CREATIVE_FORMATS = [
  { id: 'experiment', title: '交互实验', description: '调整参数、比较结果，在操作中发现关系。', instruction: '以可调参数、对照观察和重置功能为核心，显示关键变量与结果。' },
  { id: 'explanation', title: '动态演示', description: '拆解过程，让复杂概念更容易理解。', instruction: '分步骤动态呈现过程，支持暂停、重播，并以简明文字解释每一步。' },
  { id: 'exploration', title: '自由探索', description: '建立一个可探索的空间，让创意自然生长。', instruction: '围绕自由操作和即时反馈组织体验，让用户主动探索变化。' },
];
export function buildCreativePrompt(idea, domainId = 'open', formatId = 'experiment') {
  const domain = CREATIVE_DOMAINS.find(item => item.id === domainId) || CREATIVE_DOMAINS[0];
  const format = CREATIVE_FORMATS.find(item => item.id === formatId) || CREATIVE_FORMATS[0];
  const scientific = ['physics', 'biology', 'chemistry'].includes(domain.id);
  return `${String(idea || '').trim()}\n\n创作领域：${domain.title}。呈现方式：${format.title}。${format.instruction}\n请生成桌面浏览器中的可交互创意作品。除非用户明确需要，不要自动添加积分、输赢、关卡、敌人或倒计时。${scientific ? '\n涉及科学概念时，明确展示使用的模型、单位、参数范围与简化假设，区分示意动画和定量计算；不编造实验数据或把简化模型当成真实实验结论。' : ''}`;
}
const DRAFT_KEY = 'gamevallies.creative-web.draft.v1';
const VIEW_KEY = 'gamevallies.creative-web.view.v1';
export function saveCreativeDraft(draft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, createdAt: Date.now() })); return true; } catch (_) { return false; }
}
export function consumeCreativeDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
    const draft = JSON.parse(raw || 'null');
    return draft?.prompt && Date.now() - draft.createdAt < 30 * 60 * 1000 ? draft : null;
  } catch (_) { return null; }
}
export function setCreativeView(view) { try { sessionStorage.setItem(VIEW_KEY, view); } catch (_) { /* Navigation still opens home. */ } }
export function consumeCreativeView() { try { const view = sessionStorage.getItem(VIEW_KEY); sessionStorage.removeItem(VIEW_KEY); return ['home', 'works', 'ideas'].includes(view) ? view : null; } catch (_) { return null; } }
export function normalizeWorks(result) {
  return Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
}

// A one-use draft for the explicit create-result -> iterate transition.
const ITERATION_DRAFT = 'gamevallies.creative-web.iteration-draft.v1';
export function saveIterationDraft(gameId, prompt) {
  try { sessionStorage.setItem(ITERATION_DRAFT, JSON.stringify({ gameId, prompt, createdAt: Date.now() })); return true; } catch (_) { return false; }
}
export function consumeIterationDraft(gameId) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(ITERATION_DRAFT) || 'null');
    if (!draft || draft.gameId !== gameId) return '';
    sessionStorage.removeItem(ITERATION_DRAFT);
    return Date.now() - draft.createdAt < 10 * 60 * 1000 ? draft.prompt : '';
  } catch (_) { return ''; }
}
