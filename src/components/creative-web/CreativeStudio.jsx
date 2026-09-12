import ConversationStudioBody from './ConversationStudioBody';
import React, { useEffect, useRef, useState } from 'react';
import { publishGame } from '../../services/game';
import { buildGameDetailPath } from '../../utils/share';
import { PaywallPopup } from '../common/PaywallPopup';
import { publicationDraftFor, isPublicationReady } from './PublicationFields';

export default function CreativeStudio({
  mode = 'create', title = '', onTitleChange, orientation = 'landscape', onOrientationChange,
  format, onFormatChange,
  input = '', onInputChange, session, work, referenceWork, generating = false, progress, loading = false,
  error = '', primary, secondary = [], onCancel, onNew, canPlay = true, onUnlock,
  quotaText = '', supplemental = null, inputAriaLabel = 'creative-description',
}) {
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [published, setPublished] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [publicationDraft, onPublicationDraftChange] = useState(() => publicationDraftFor(work));
  useEffect(() => onPublicationDraftChange(publicationDraftFor(work)), [work?.id, work?.title, work?.description]);
  const actionRef = useRef(false);
  const previousPlayable = useRef(null);
  useEffect(() => { setPublished(work?.status === 'published'); setShareUrl(work?.status === 'published' ? `${window.location.origin}${window.location.pathname}#${buildGameDetailPath(work.id)}` : ''); setPublishError(''); }, [work?.id, work?.status]);
  const completed = Boolean(work?.id && ['ready', 'draft', 'published', 'review', 'completed'].includes(work.status));
  if (completed) previousPlayable.current = work;
  if (previousPlayable.current?.id !== work?.id) previousPlayable.current = null;
  const previewWork = completed ? work : previousPlayable.current || referenceWork;
  const displayTitle = title || work?.title || '新的创意';
  async function publish() {
    if (!work?.id || actionRef.current || !isPublicationReady(publicationDraft)) return;
    actionRef.current = true; setPublishing(true); setPublishError('');
    try {
      const result = await publishGame(work.id, { visibility: 'public', title: publicationDraft.title.trim(), description: publicationDraft.description.trim() });
      // A successful request can enter moderation; do not invent a public result.
      const status = result?.status || result?.game?.status;
      if (status === 'published') {
        setPublished(true);
        setShareUrl(`${window.location.origin}${window.location.pathname}#${buildGameDetailPath(work.id)}`);
      } else setPublishError('发布请求已提交，请在我的作品中查看审核与发布状态。');
    } catch (err) { setPublishError(err?.message || '发布失败，请稍后重试。'); }
    finally { actionRef.current = false; setPublishing(false); }
  }
  return <ConversationStudioBody {...{mode, displayTitle, onTitleChange, orientation, onOrientationChange, format, onFormatChange, input, onInputChange, session, work, previewWork, generating, progress, loading, error, primary, secondary, onCancel, onNew, canPlay, onUnlock, quotaText, supplemental, inputAriaLabel, completed, publishing, published, publishError, shareUrl, publish, publicationDraft, onPublicationDraftChange}}><PaywallPopup /></ConversationStudioBody>;
}
