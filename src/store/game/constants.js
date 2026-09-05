// Shared creation and generation policy constants.


export const COMPLETED_GAME_STATUSES = ['ready', 'draft', 'published', 'review'];
export const TERMINAL_TASK_STATUSES = new Set(['succeeded', 'failed', 'canceled', 'timed_out']);
export const ACTIVE_GENERATION_TASK_KEY = 'gamevallies_active_generation_task';
export const TRACKED_GENERATION_TASKS_KEY = 'gamevallies_tracked_generation_tasks';
export const ACTIVE_GENERATION_TASK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_TASK_TIMEOUT_MS = 30 * 60 * 1000;
// #8 闃舵鍋滄粸妫€娴嬶細鍚屼竴闃舵瓒呰繃姝ゆ椂闂磋Е鍙戞彁绀?
export const STAGE_STALE_WARN_MS = 5 * 60 * 1000;
export const TRACKED_TASKS_LIMIT = 20;
export const SESSION_INIT_POLL_INTERVAL_MS = 2000;
export const SESSION_INIT_MAX_POLLS = 15;
export const SESSION_READY_WAIT_INTERVAL_MS = 200;
export const SESSION_READY_WAIT_TIMEOUT_MS = (SESSION_INIT_POLL_INTERVAL_MS * SESSION_INIT_MAX_POLLS) + 1000;
export const ACTIVE_CREATION_SESSION_STATUSES = new Set(['initializing', 'collecting', 'ready']);

export const PIPELINE_STAGES = [
  { key: 'understanding', label: '理解想法', pct: 15 },
  { key: 'designing', label: '设计交互', pct: 35 },
  { key: 'generating', label: '搭建作品', pct: 60 },
  { key: 'validating', label: '检查细节', pct: 85 },
  { key: 'finalizing', label: '完成', pct: 100 },
];

export const DETAILED_PIPELINE_STAGES = [
  { key: 'submitting', label: '收到想法', pct: 5 },
  { key: 'spec_build', label: '想清楚怎么玩', pct: 15 },
  { key: 'runtime_profile_select', label: '挑一套玩法模板', pct: 30 },
  { key: 'contract_compose', label: '准备画面和规则', pct: 40 },
  { key: 'logic_generate', label: '搭建作品', pct: 60 },
  { key: 'contract_qa', label: '检查细节', pct: 76 },
  { key: 'runtime_simulation_qa', label: '体验一遍', pct: 92 },
  { key: 'completed', label: '完成', pct: 100 },
];

export const PIPELINE_STAGE_SUMMARIES = {
  understanding: '正在理解你的作品想法',
  designing: '正在整理玩法和画面设计',
  generating: '正在把交互一步步写出来',
  validating: '正在自检并调整细节',
  finalizing: '你的作品做好了',
  submitting: '正在收下你的想法',
  spec_build: '正在想清楚玩法和主要设定',
  runtime_profile_select: '正在挑一套最合适的玩法模板',
  contract_compose: '正在搭好画面、规则和节奏',
  logic_generate: '正在把交互一步步写出来',
  contract_qa: '正在自检并调整细节',
  runtime_simulation_qa: '正在体验一遍，确认能顺畅玩',
  completed: '你的作品做好了',
};

export const DISPLAY_STAGE_ALIASES = {
  understanding: 'understanding',
  designing: 'designing',
  generating: 'generating',
  validating: 'validating',
  finalizing: 'finalizing',
  submitting: 'understanding',
  spec_build: 'understanding',
  runtime_profile_select: 'designing',
  contract_compose: 'generating',
  logic_generate: 'generating',
  contract_qa: 'validating',
  runtime_simulation_qa: 'validating',
  completed: 'finalizing',
};

export const STAGE_KEY_ALIASES = {
  started: 'submitting',
  queued: 'submitting',
  submitted: 'submitting',
  running: 'submitting',
  submitting: 'submitting',
  dialogue_slot_extract: 'submitting',
  'dialogue.slot_extract': 'submitting',
  dialogue_reply: 'submitting',
  'dialogue.reply': 'submitting',
  intent_parse: 'submitting',
  intent_parsing: 'submitting',
  request_normalized: 'submitting',
  understanding: 'understanding',
  spec_build: 'spec_build',
  runtime_profile_select: 'runtime_profile_select',
  template_match: 'runtime_profile_select',
  template_matching: 'runtime_profile_select',
  designing: 'designing',
  contract_compose: 'contract_compose',
  generating: 'generating',
  logic_generate: 'logic_generate',
  code_generate: 'logic_generate',
  code_generating: 'logic_generate',
  contract_qa: 'contract_qa',
  qa_fix: 'contract_qa',
  qa_checking: 'contract_qa',
  targeted_remediation: 'contract_qa',
  validating: 'validating',
  runtime_simulation_qa: 'runtime_simulation_qa',
  runtime_qa: 'runtime_simulation_qa',
  code_review: 'runtime_simulation_qa',
  finalizing: 'finalizing',
  completed: 'finalizing',
  succeeded: 'finalizing',
};
