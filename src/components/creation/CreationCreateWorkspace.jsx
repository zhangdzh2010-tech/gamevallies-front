/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text, Input, Textarea } from '@tarojs/components';
import './CreationSession.scss';

const IS_H5 = process.env.TARO_ENV === 'h5';

function formatPreviewDraft(draft) {
  if (draft == null || draft === '') {
    return '';
  }

  if (typeof draft === 'string') {
    return draft;
  }

  try {
    return JSON.stringify(draft, null, 2);
  } catch (_error) {
    return String(draft);
  }
}

function normalizeMessageContent(content) {
  return String(content || '').trim();
}

function normalizeComparableText(content) {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function messagesOverlap(primaryContent, secondaryContent) {
  const normalizedPrimary = normalizeComparableText(primaryContent);
  const normalizedSecondary = normalizeComparableText(secondaryContent);

  if (!normalizedPrimary || !normalizedSecondary) {
    return false;
  }

  return normalizedPrimary === normalizedSecondary
    || normalizedPrimary.includes(normalizedSecondary)
    || normalizedSecondary.includes(normalizedPrimary);
}

function messageAlreadyCoversQuestion(messageContent, questionContent, questionDescription) {
  const normalizedMessage = normalizeComparableText(messageContent);
  if (!normalizedMessage) {
    return false;
  }

  const candidates = [
    questionContent,
    [questionContent, questionDescription].filter(Boolean).join(' '),
    questionDescription,
  ]
    .map((item) => normalizeComparableText(item))
    .filter(Boolean);

  return candidates.some((candidate) => (
    messagesOverlap(normalizedMessage, candidate)
  ));
}

function buildThreadMessage(message, fallbackId) {
  const content = normalizeMessageContent(message?.content);
  if (!content) {
    return null;
  }

  return {
    ...message,
    id: message?.id || fallbackId,
    role: message?.role || 'assistant',
    content,
  };
}

function pickPreferredThreadMessage(previousMessage, nextMessage) {
  const previousComparable = normalizeComparableText(previousMessage?.content);
  const nextComparable = normalizeComparableText(nextMessage?.content);

  if (!previousComparable) {
    return nextMessage;
  }

  if (!nextComparable) {
    return previousMessage;
  }

  if (
    nextComparable.length > previousComparable.length
    && nextComparable.includes(previousComparable)
  ) {
    return nextMessage;
  }

  return previousMessage;
}

function appendThreadMessage(messages, rawMessage, fallbackId) {
  const nextMessage = buildThreadMessage(rawMessage, fallbackId);
  if (!nextMessage) {
    return messages;
  }

  const previousMessage = messages[messages.length - 1];
  if (
    previousMessage
    && previousMessage.role === nextMessage.role
    && messagesOverlap(previousMessage.content, nextMessage.content)
  ) {
    const preferredMessage = pickPreferredThreadMessage(previousMessage, nextMessage);
    if (preferredMessage === previousMessage) {
      return messages;
    }

    return [
      ...messages.slice(0, -1),
      preferredMessage,
    ];
  }

  return [
    ...messages,
    nextMessage,
  ];
}

function appendStreamingMessage(messages, streamingMessage) {
  const streamingContent = normalizeMessageContent(streamingMessage?.content);
  if (!streamingContent) {
    return messages;
  }

  const hasDuplicateAssistantMessage = messages.some((message) => (
    message.role === 'assistant'
    && messagesOverlap(message.content, streamingContent)
  ));

  if (hasDuplicateAssistantMessage) {
    return messages;
  }

  return appendThreadMessage(messages, {
    id: streamingMessage?.id || 'assistant-stream',
    role: 'assistant',
    content: streamingContent,
    isStreaming: streamingMessage?.isStreaming === true,
  }, 'assistant-stream');
}

function buildThreadMessages(session, introMessage, streamingMessage, pendingUserMessage) {
  const sessionMessages = Array.isArray(session?.messages) ? session.messages : [];
  const questionContent = session?.currentQuestion?.content || '';
  const questionDescription = session?.currentQuestion?.description || '';
  const questionText = [questionContent, questionDescription]
    .filter(Boolean)
    .join('\n');

  let messages = [];

  if (!sessionMessages.length) {
    messages = appendThreadMessage(messages, {
      id: 'intro-message',
      role: 'assistant',
      content: introMessage,
    }, 'intro-message');

    if (session?.prompt) {
      messages = appendThreadMessage(messages, {
        id: 'initial-prompt',
        role: 'user',
        content: session.prompt,
      }, 'initial-prompt');
    }

    if (questionText) {
      messages = appendThreadMessage(messages, {
        id: 'current-question',
        role: 'assistant',
        content: questionText,
      }, 'current-question');
    }
  } else {
    messages = sessionMessages.reduce((threadMessages, message, index) => (
      appendThreadMessage(
        threadMessages,
        {
          id: message.id || `${message.role || 'message'}-${index}`,
          role: message.role || 'assistant',
          content: message.content || '',
        },
        `${message.role || 'message'}-${index}`,
      )
    ), []);
  }

  if (questionText) {
    const hasSameQuestion = messages.some((message) => (
      message.role === 'assistant'
      && messageAlreadyCoversQuestion(message.content, questionContent, questionDescription)
    ));

    if (!hasSameQuestion) {
      messages = appendThreadMessage(messages, {
        id: 'current-question',
        role: 'assistant',
        content: questionText,
      }, 'current-question');
    }
  }

  if (pendingUserMessage?.content) {
    messages = appendThreadMessage(messages, {
      ...pendingUserMessage,
      role: 'user',
    }, pendingUserMessage.id || 'pending-user-message');
  }

  return appendStreamingMessage(messages, streamingMessage);
}

function getActionButtonClassName({ tone = 'ghost', disabled = false }) {
  return [
    'creation-create-composer__action',
    tone === 'primary' ? 'creation-create-composer__action--primary' : '',
    disabled ? 'creation-create-composer__action--disabled' : '',
  ].filter(Boolean).join(' ');
}

export function CreationCreateWorkspace({
  showSettings = true,
  gameName = '',
  onGameNameChange,
  orientation = 'portrait',
  onOrientationChange,
  orientationOptions = [],
  topContent = null,
  session = null,
  streamingMessage = null,
  pendingUserMessage = null,
  inputValue = '',
  onInputChange,
  inputPlaceholder = '继续补充你的想法...',
  onSend,
  onSkip,
  onGenerate,
  onPreview,
  sendDisabled = false,
  skipDisabled = false,
  generateDisabled = false,
  previewDisabled = false,
  showSkip = true,
  showGenerate = true,
  showPreview = true,
  previewExpanded = false,
  errorMessage = '',
  isSubmitting = false,
  threadTitle = '说说你的想法',
  threadHint = '像聊天一样往下说，AI 会继续追问或直接整理方案。',
  sendLabel = '发送',
  skipLabel = '跳过',
  generateLabel = '直接生成',
  previewLabel = '预览',
  previewTitle = '方案预览',
  previewEmptyText = 'AI 正在整理这一版方向，稍等片刻就会显示在这里。',
  introMessage = '先告诉我你想做什么，我会帮你补齐细节。',
}) {
  const threadMessages = buildThreadMessages(
    session,
    introMessage,
    streamingMessage,
    pendingUserMessage,
  );
  const previewDraftText = formatPreviewDraft(session?.planDraft);
  const showPreviewPanel = previewExpanded && (previewDraftText || session);
  const threadScrollRef = React.useRef(null);
  const composerTextareaRef = React.useRef(null);
  const actionCount = [showSkip, showGenerate, showPreview].filter(Boolean).length || 1;
  const latestThreadMessage = threadMessages[threadMessages.length - 1];
  const threadTailSignature = `${threadMessages.length}:${latestThreadMessage?.id || ''}:${latestThreadMessage?.content || ''}`;

  const getComposerMinContentHeight = React.useCallback(() => {
    if (!IS_H5 || !composerTextareaRef.current || typeof window === 'undefined') {
      return 0;
    }

    const inputWrap = composerTextareaRef.current.parentElement;
    if (!inputWrap) {
      return 0;
    }

    const inputWrapStyles = window.getComputedStyle(inputWrap);
    const wrapMinHeight = parseFloat(inputWrapStyles.minHeight || '0');
    const paddingTop = parseFloat(inputWrapStyles.paddingTop || '0');
    const paddingBottom = parseFloat(inputWrapStyles.paddingBottom || '0');

    return Math.max(0, wrapMinHeight - paddingTop - paddingBottom);
  }, []);

  const syncComposerHeight = React.useCallback(() => {
    if (!IS_H5 || !composerTextareaRef.current) {
      return;
    }

    const element = composerTextareaRef.current;
    const minContentHeight = getComposerMinContentHeight();
    element.style.height = '0px';
    element.style.height = `${Math.max(minContentHeight, element.scrollHeight)}px`;
  }, [getComposerMinContentHeight]);

  React.useEffect(() => {
    const scrollHost = threadScrollRef.current?.root || threadScrollRef.current;
    if (!scrollHost) {
      return undefined;
    }

    const scrollToBottom = () => {
      if (typeof scrollHost.scrollTop === 'number') {
        scrollHost.scrollTop = scrollHost.scrollHeight;
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      const frameId = requestAnimationFrame(scrollToBottom);
      return () => cancelAnimationFrame(frameId);
    }

    scrollToBottom();
    return undefined;
  }, [threadTailSignature, showPreviewPanel, previewDraftText]);

  React.useEffect(() => {
    syncComposerHeight();
  }, [inputValue, syncComposerHeight]);

  const handleComposerNativeInput = (event) => {
    syncComposerHeight();
    onInputChange?.({
      detail: {
        value: event.currentTarget.value,
      },
    });
  };

  return (
    <View className="creation-create-workspace">
      {showSettings ? (
        <View className="creation-session-card creation-create-settings">
          <View className="creation-create-settings__grid">
            <View className="creation-create-settings__field creation-create-settings__field--orientation">
              <Text className="creation-create-settings__label">展示方向</Text>
              <View className="creation-create-orientation">
                {orientationOptions.map((option) => {
                  const isActive = orientation === option.value;

                  return (
                    <View
                      key={option.value}
                      className={`creation-create-orientation__option${isActive ? ' is-active' : ''}`}
                      onClick={() => onOrientationChange?.(option.value)}
                    >
                      <Text className="creation-create-orientation__text">{option.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View className="creation-create-settings__field creation-create-settings__field--name">
              <Text className="creation-create-settings__label">游戏名称</Text>
              <View className="creation-config-input-wrap">
                <Input
                  className="creation-config-input"
                  placeholder="给你的游戏起个名字（可选）"
                  placeholderStyle="color: #55516e"
                  value={gameName}
                  onInput={onGameNameChange}
                  maxlength={30}
                />
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {topContent ? (
        <View className="creation-create-workspace__stack">
          {topContent}
        </View>
      ) : null}

      {errorMessage ? (
        <View className="creation-session-inline-error">
          <Text className="creation-session-inline-error__text">{errorMessage}</Text>
        </View>
      ) : null}

      <View className="creation-session-card creation-create-chat">
        <View className="creation-session-card__header">
          <View>
            <Text className="creation-session-card__title">{threadTitle}</Text>
            <Text className="creation-session-card__hint">{threadHint}</Text>
          </View>
        </View>

        <View className="creation-create-chat__body">
          <View className="creation-create-thread-scroll" ref={threadScrollRef}>
            <View className="creation-create-thread">
              {threadMessages.map((message) => (
                <View
                  key={message.id}
                  className={`creation-conversation-item${message.role === 'user' ? ' creation-conversation-item--user' : ''}${message.isStreaming ? ' creation-conversation-item--streaming' : ''}`}
                >
                  <Text className="creation-conversation-item__role">{message.role === 'user' ? '你' : 'AI'}</Text>
                  <Text className="creation-conversation-item__content">{message.content || ' '}</Text>
                </View>
              ))}
            </View>

            {showPreviewPanel ? (
              <View className="creation-create-preview">
                <Text className="creation-create-preview__label">{previewTitle}</Text>
                <Text className="creation-create-preview__content">
                  {previewDraftText || previewEmptyText}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="creation-create-composer">
            <View className="creation-create-composer__row">
              <View className="creation-create-composer__input-wrap">
                {IS_H5 ? (
                  <textarea
                    ref={composerTextareaRef}
                    className="creation-create-composer__input creation-create-composer__input--native"
                    placeholder={inputPlaceholder}
                    value={inputValue}
                    onInput={handleComposerNativeInput}
                    maxLength={2000}
                    rows={1}
                  />
                ) : (
                  <Textarea
                    className="creation-create-composer__input"
                    placeholder={inputPlaceholder}
                    placeholderStyle="color: #67627d"
                    value={inputValue}
                    onInput={onInputChange}
                    maxlength={2000}
                    autoHeight
                  />
                )}
              </View>

              <View
                className={`creation-create-composer__send${sendDisabled ? ' creation-create-composer__send--disabled' : ''}`}
                onClick={sendDisabled ? undefined : onSend}
              >
                <Text className="creation-create-composer__send-text">{isSubmitting ? '稍等' : sendLabel}</Text>
              </View>
            </View>

            <View
              className="creation-create-composer__actions"
              style={{ gridTemplateColumns: `repeat(${actionCount}, minmax(0, 1fr))` }}
            >
              {showSkip ? (
                <View
                  className={getActionButtonClassName({ disabled: skipDisabled })}
                  onClick={skipDisabled ? undefined : onSkip}
                >
                  <Text className="creation-create-composer__action-text">{skipLabel}</Text>
                </View>
              ) : null}

              {showGenerate ? (
                <View
                  className={getActionButtonClassName({ tone: 'primary', disabled: generateDisabled })}
                  onClick={generateDisabled ? undefined : onGenerate}
                >
                  <Text className="creation-create-composer__action-text">{generateLabel}</Text>
                </View>
              ) : null}

              {showPreview ? (
                <View
                  className={getActionButtonClassName({ disabled: previewDisabled })}
                  onClick={previewDisabled ? undefined : onPreview}
                >
                  <Text className="creation-create-composer__action-text">{previewLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export default CreationCreateWorkspace;
