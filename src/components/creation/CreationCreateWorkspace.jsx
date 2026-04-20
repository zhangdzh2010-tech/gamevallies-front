/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text, Input, Textarea } from '@tarojs/components';
import './CreationSession.scss';

const IS_H5 = process.env.TARO_ENV === 'h5';

function getActionButtonClassName({ tone = 'ghost', disabled = false, fullWidth = false }) {
  return [
    'creation-create-composer__action',
    tone === 'primary' ? 'creation-create-composer__action--primary' : '',
    tone === 'danger' ? 'creation-create-composer__action--danger' : '',
    disabled ? 'creation-create-composer__action--disabled' : '',
    fullWidth ? 'creation-create-composer__action--full-width' : '',
  ].filter(Boolean).join(' ');
}

function getSessionStatusLabel(status) {
  if (status === 'initializing') {
    return '整理中';
  }

  if (status === 'collecting') {
    return '待确认';
  }

  if (status === 'ready') {
    return '可生成';
  }

  if (status === 'generating') {
    return '生成中';
  }

  if (status === 'completed') {
    return '已完成';
  }

  return '处理中';
}

function getSessionStatusTone(status) {
  if (status === 'ready') {
    return 'ready';
  }

  if (status === 'completed') {
    return 'success';
  }

  if (status === 'failed' || status === 'abandoned' || status === 'expired') {
    return 'danger';
  }

  return 'neutral';
}

function normalizeText(content) {
  return String(content || '').trim();
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
  inputValue = '',
  onInputChange,
  inputPlaceholder = '继续补充你的想法...',
  onPrimaryAction,
  primaryActionLabel = '让 AI 整理一下',
  primaryActionDisabled = false,
  secondaryActions = [],
  errorMessage = '',
  isSubmitting = false,
  workspaceTitle = '说说你的想法',
  workspaceHint = '先说一句话，AI 会帮你补成一版完整方向，你改改就能开始做。',
  introMessage = '先告诉我你想做什么，我会整理出一版完整方向。',
  helperText = '',
  loadingTitle = 'AI 正在把你的想法补成完整方向',
  loadingDescription = '通常只要几秒，AI 会整理出一版你可以改的方向。',
  initialLabel = '你的初始想法',
  initialHint = '先描述玩法、主题或你想实现的感觉，越自然越好。',
  draftLabel = 'AI 整理出的方向',
  draftHint = '你可以继续改这段方向，改完就能开始做。',
}) {
  const hasSession = Boolean(session?.sessionId);
  const isInitializing = session?.status === 'initializing';
  const normalizedHelperText = normalizeText(
    helperText || session?.currentQuestion?.prompt || session?.currentQuestion?.content || ''
  );
  const editorTextareaRef = React.useRef(null);
  const secondaryActionItems = secondaryActions.filter(Boolean);

  const getEditorMinContentHeight = React.useCallback(() => {
    if (!IS_H5 || !editorTextareaRef.current || typeof window === 'undefined') {
      return 0;
    }

    const fieldElement = editorTextareaRef.current.parentElement;
    if (!fieldElement) {
      return 0;
    }

    const fieldStyles = window.getComputedStyle(fieldElement);
    const minHeight = parseFloat(fieldStyles.minHeight || '0');
    const paddingTop = parseFloat(fieldStyles.paddingTop || '0');
    const paddingBottom = parseFloat(fieldStyles.paddingBottom || '0');

    return Math.max(0, minHeight - paddingTop - paddingBottom);
  }, []);

  const syncEditorHeight = React.useCallback(() => {
    if (!IS_H5 || !editorTextareaRef.current) {
      return;
    }

    const element = editorTextareaRef.current;
    const minContentHeight = getEditorMinContentHeight();
    element.style.height = '0px';
    element.style.height = `${Math.max(minContentHeight, element.scrollHeight)}px`;
  }, [getEditorMinContentHeight]);

  React.useEffect(() => {
    syncEditorHeight();
  }, [inputValue, syncEditorHeight]);

  const handleNativeInput = (event) => {
    syncEditorHeight();
    onInputChange?.({
      detail: {
        value: event.currentTarget.value,
      },
    });
  };

  const renderEditor = (fieldMode = 'entry') => (
    <View className="creation-create-editor">
      <Text className="creation-create-editor__label">
        {fieldMode === 'prompt' ? draftLabel : initialLabel}
      </Text>
      <Text className="creation-create-editor__hint">
        {fieldMode === 'prompt' ? draftHint : initialHint}
      </Text>

      <View className={`creation-create-editor__field creation-create-editor__field--${fieldMode}`}>
        {IS_H5 ? (
          <textarea
            ref={editorTextareaRef}
            className="creation-create-editor__input creation-create-editor__input--native"
            placeholder={inputPlaceholder}
            value={inputValue}
            onInput={handleNativeInput}
            maxLength={4000}
            rows={fieldMode === 'prompt' ? 8 : 4}
          />
        ) : (
          <Textarea
            className="creation-create-editor__input"
            placeholder={inputPlaceholder}
            placeholderStyle="color: #67627d"
            value={inputValue}
            onInput={onInputChange}
            maxlength={4000}
            autoHeight
          />
        )}
      </View>
    </View>
  );

  return (
    <View className="creation-create-workspace">
      {showSettings ? (
        <View className="creation-session-card creation-create-settings">
          <View className="creation-create-settings__grid">
            <View className="creation-create-settings__field creation-create-settings__field--orientation">
              <Text className="creation-create-settings__label">屏幕方向</Text>
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
        <View className="creation-session-card__header creation-session-card__header--workspace">
          <View>
            <Text className="creation-session-card__title">{workspaceTitle}</Text>
            <Text className="creation-session-card__hint">{workspaceHint}</Text>
          </View>

          {hasSession ? (
            <View className={`creation-session-status-chip creation-session-status-chip--${getSessionStatusTone(session?.status)}`}>
              <Text className="creation-session-status-chip__text">
                {getSessionStatusLabel(session?.status)}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="creation-create-chat__body creation-create-chat__body--prompt">
          {hasSession ? (
            <View className="creation-create-stage-summary">
              {normalizedHelperText ? (
                <View className="creation-create-stage-summary__assistant">
                  <Text className="creation-create-stage-summary__assistant-label">AI</Text>
                  <Text className="creation-create-stage-summary__assistant-text">{normalizedHelperText}</Text>
                </View>
              ) : null}

              {normalizeText(session?.initialPrompt || session?.prompt) ? (
                <View className="creation-create-stage-summary__meta">
                  <Text className="creation-create-stage-summary__meta-label">最初输入</Text>
                  <Text className="creation-create-stage-summary__meta-text">
                    {session?.initialPrompt || session?.prompt}
                  </Text>
                </View>
              ) : null}

              {isInitializing ? (
                <View className="creation-state-card creation-state-card--centered creation-create-loading-card">
                  <Text className="creation-state-card__eyebrow">AI 正在整理</Text>
                  <Text className="creation-state-card__title">{loadingTitle}</Text>
                  <Text className="creation-state-card__description">{loadingDescription}</Text>
                  <View className="creation-state-card__spinner">
                    <View className="creation-state-card__spinner-dot" />
                    <View className="creation-state-card__spinner-dot" />
                    <View className="creation-state-card__spinner-dot" />
                  </View>
                </View>
              ) : (
                renderEditor('prompt')
              )}
            </View>
          ) : (
            <View className="creation-create-stage-summary">
              <View className="creation-create-stage-summary__assistant">
                <Text className="creation-create-stage-summary__assistant-label">AI</Text>
                <Text className="creation-create-stage-summary__assistant-text">{introMessage}</Text>
              </View>
              {renderEditor('entry')}
            </View>
          )}

          {!isInitializing ? (
            <View className="creation-create-composer creation-create-composer--prompt">
              <View
                className={getActionButtonClassName({
                  tone: 'primary',
                  disabled: primaryActionDisabled,
                  fullWidth: true,
                })}
                onClick={primaryActionDisabled ? undefined : onPrimaryAction}
              >
                <Text className="creation-create-composer__action-text">
                  {isSubmitting ? '处理中' : primaryActionLabel}
                </Text>
              </View>

              {secondaryActionItems.length ? (
                <View
                  className="creation-create-composer__actions"
                  style={{ gridTemplateColumns: `repeat(${secondaryActionItems.length}, minmax(0, 1fr))` }}
                >
                  {secondaryActionItems.map((action) => (
                    <View
                      key={action.key}
                      className={getActionButtonClassName({
                        tone: action.tone || 'ghost',
                        disabled: Boolean(action.disabled),
                      })}
                      onClick={action.disabled ? undefined : action.onClick}
                    >
                      <Text className="creation-create-composer__action-text">{action.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default CreationCreateWorkspace;
