// Creation-session snapshots and UI derivation; no store ownership.
import {
  ACTIVE_CREATION_SESSION_STATUSES,
} from './constants';
import {
  isCompletedGameStatus,
} from './taskProgress';

export function getCreationSessionRuntimePhase(session) {
  if (!session?.sessionId) {
    return '';
  }

  if (session.status === 'initializing') {
    return 'initializing';
  }

  if (ACTIVE_CREATION_SESSION_STATUSES.has(session.status)) {
    return 'interactive';
  }

  return '';
}


export function getCreationSessionRuntimeBindingKey(session) {
  const phase = getCreationSessionRuntimePhase(session);
  if (!phase) {
    return '';
  }

  return `${String(session.sessionId)}:${phase}`;
}


export function deriveCreationSessionErrorMessage(error, fallback = '创作会话处理失败，请稍后重试') {
  const source = typeof error === 'string'
    ? error.trim()
    : error?.message
      ? String(error.message).trim()
      : '';

  if (!source) {
    return fallback;
  }

  if (/revision|版本冲突|冲突/i.test(source)) {
    return '当前创作已在其他地方更新，已自动刷新，请重试';
  }

  if (/expired|过期/i.test(source)) {
    return '创作会话已过期，请重新开始';
  }

  if (/abandoned|已结束|已放弃/i.test(source)) {
    return '当前创作会话已结束，请重新开启';
  }

  if (/aborted a request|aborterror|aborted|取消了请求|中断了请求/i.test(source)) {
    return '这次请求被中断了，请再试一次';
  }

  if (/request:fail timeout|timeout|timed out|超时/i.test(source)) {
    return '这次请求超时了，请稍后再试';
  }

  if (/network|request:fail|econn|enotfound|enetunreach|网络/i.test(source)) {
    return '当前网络不稳定，请稍后重试';
  }

  if (/authentication required|unauthorized|请先登录/i.test(source)) {
    return '登录状态已失效，请重新登录后继续';
  }

  if (/restore|恢复/i.test(source)) {
    return '恢复创作失败，请手动重新开始';
  }

  if (/generate|生成/i.test(source)) {
    return '生成阶段遇到问题，可稍后重试';
  }

  if (/must be longer than or equal to 5 characters|min length 5|at least 5/i.test(source)) {
    return '至少输入 5 个字，再开始这一轮';
  }

  // #10 补充更多常见错误类型的友好提示
  if (/quota|limit|配额|次数.*用完|额度/i.test(source)) {
    return '创作次数已用完，请升级或等待配额刷新';
  }

  if (/forbidden|permission|权限|禁止/i.test(source)) {
    return '没有操作权限，请确认账号状态';
  }

  if (/not found|404|找不到/i.test(source)) {
    return '请求的资源不存在，可能已被删除';
  }

  if (/server error|internal server|HTTP 5\d{2}|服务器/i.test(source)) {
    return '服务器暂时出了点问题，请稍后再试';
  }

  if (/rate.?limit|too many|频繁/i.test(source)) {
    return '操作太频繁了，请稍后再试';
  }

  if (!/[\u4e00-\u9fa5]/.test(source)) {
    return fallback;
  }

  return source || fallback;
}


export function normalizeSessionMessageContent(content) {
  return String(content || '').trim();
}


export function buildPendingCreationSessionUserMessage(content, session) {
  const normalizedContent = normalizeSessionMessageContent(content);
  if (!normalizedContent) {
    return null;
  }

  return {
    id: `pending-user-${session?.sessionId || 'session'}-${Date.now()}`,
    role: 'user',
    content: normalizedContent,
    createdAt: Date.now(),
    revision: session?.revision ?? null,
    isPending: true,
  };
}


export function getCreationSessionRevision(session) {
  const revision = Number(session?.revision ?? 0);
  return Number.isFinite(revision) ? revision : 0;
}


export function getCreationSessionExpandedPrompt(session) {
  if (session?.expandedPrompt != null && session.expandedPrompt !== '') {
    return String(session.expandedPrompt);
  }

  if (session?.prompt != null && session.prompt !== '') {
    return String(session.prompt);
  }

  if (session?.initialPrompt != null && session.initialPrompt !== '') {
    return String(session.initialPrompt);
  }

  return '';
}


export function getCreationSessionQuestionText(session) {
  return [session?.currentQuestion?.content, session?.currentQuestion?.description]
    .filter(Boolean)
    .join('\n')
    .trim();
}


export function buildCreationSessionUiState(session) {
  const status = String(session?.status || '');

  return {
    isInitializing: status === 'initializing',
    isAwaitingPromptConfirmation: status === 'collecting',
    canGenerate: status === 'collecting' || status === 'ready',
    canEditPrompt: status === 'collecting' || status === 'ready',
  };
}


export function isCreationSessionRevisionConflictError(error) {
  const statusCode = Number(error?.statusCode ?? error?.status ?? 0);
  return statusCode === 409 || /revision|版本冲突|冲突/i.test(error?.message || '');
}


export function sessionContainsAssistantReply(session, reply) {
  const replyContent = normalizeSessionMessageContent(reply?.content);
  if (!replyContent) {
    return false;
  }

  const hasMatchingMessage = Array.isArray(session?.messages) && session.messages.some((message) => (
    message?.role === 'assistant'
    && normalizeSessionMessageContent(message.content) === replyContent
  ));

  if (hasMatchingMessage) {
    return true;
  }

  return normalizeSessionMessageContent(getCreationSessionQuestionText(session)) === replyContent;
}


export function sessionContainsUserReply(session, reply) {
  const replyContent = normalizeSessionMessageContent(reply?.content);
  if (!replyContent) {
    return false;
  }

  return Array.isArray(session?.messages) && session.messages.some((message) => (
    message?.role === 'user'
    && normalizeSessionMessageContent(message.content) === replyContent
  ));
}


export function isStaleCreationSessionSnapshot(previousSession, nextSession) {
  if (!previousSession?.sessionId || !nextSession?.sessionId) {
    return false;
  }

  if (String(previousSession.sessionId) !== String(nextSession.sessionId)) {
    return false;
  }

  const previousRevision = getCreationSessionRevision(previousSession);
  const nextRevision = getCreationSessionRevision(nextSession);

  return previousRevision > 0 && nextRevision > 0 && nextRevision < previousRevision;
}


export function resolveCreationSessionStreamingReply(previousSession, nextSession, streamingReply) {
  if (!streamingReply) {
    return null;
  }

  if (!previousSession?.sessionId || !nextSession?.sessionId) {
    return null;
  }

  if (String(previousSession.sessionId) !== String(nextSession.sessionId)) {
    return null;
  }

  if (!getCreationSessionRuntimePhase(nextSession)) {
    return null;
  }

  return sessionContainsAssistantReply(nextSession, streamingReply) ? null : streamingReply;
}


export function resolveCreationSessionPendingUserMessage(previousSession, nextSession, pendingUserMessage) {
  if (!pendingUserMessage) {
    return null;
  }

  if (!previousSession?.sessionId || !nextSession?.sessionId) {
    return null;
  }

  if (String(previousSession.sessionId) !== String(nextSession.sessionId)) {
    return null;
  }

  return sessionContainsUserReply(nextSession, pendingUserMessage) ? null : pendingUserMessage;
}


export function countPromptCharacters(value) {
  return Array.from(String(value || '').trim()).length;
}


export function buildCreationSessionContext(input = {}) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  return {
    prompt: input.prompt || input.description || '',
    title: input.title || '',
    entryMode: input.entryMode || 'create',
    orientation: input.orientation || 'portrait',
    generationTier: input.generationTier || 'standard',
    sourceGameId: input.sourceGameId || '',
  };
}


export function getCreationFlowStageFromState(state) {
  if (state.isGenerating) {
    return 'generating';
  }

  const sessionStatus = state.creationSession?.status || '';

  if (sessionStatus === 'initializing') {
    return 'initializing';
  }

  if (sessionStatus === 'ready') {
    return 'ready_to_generate';
  }

  if (sessionStatus === 'collecting') {
    return 'collecting';
  }

  if (sessionStatus === 'expired') {
    return 'expired';
  }

  if (sessionStatus === 'abandoned') {
    return 'abandoned';
  }

  if (sessionStatus === 'failed') {
    return 'failed';
  }

  if (sessionStatus === 'completed') {
    return 'completed';
  }

  if (state.currentGame && isCompletedGameStatus(state.currentGame?.status)) {
    return 'completed';
  }

  return 'idle';
}
