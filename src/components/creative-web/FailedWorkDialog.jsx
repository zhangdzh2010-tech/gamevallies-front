import React, { useEffect, useRef, useState } from 'react';
import { getGenerationStatus, getGenerationTask } from '../../services/game';
import { openCreatePageWithAuth } from '../../utils/authNavigation';
import { saveCreativeDraft } from './creativeModel';

export const isFailedWork = work => ['failed', 'timed_out', 'canceled', 'cancelled'].includes(work?.status);

// Inspect a terminal task without restoring it into the active creation store.
export default function FailedWorkDialog({ work, onClose }) {
  const dialog = useRef(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!work?.id && !work?.taskId) return undefined;
    let active = true;
    setDetail(null); setError(''); setLoading(true);
    dialog.current?.showModal();
    (work.taskId ? getGenerationTask(work.taskId) : getGenerationStatus(work.id)).then(result => { if (active) setDetail(result); })
      .catch(err => { if (active) setError(err?.message || '暂时无法读取任务详情。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [work?.id, work?.taskId]);
  if (!work) return null;
  const task = detail?.generationTask || detail?.task || detail;
  const reason = task?.terminalError?.message || task?.errorMessage || task?.failedReason || detail?.failedReason || work.errorMessage || work.failedReason;
  const restart = () => {
    const prompt = work.description || '';
    if (!saveCreativeDraft({ prompt, title: work.title, orientation: 'landscape' })) {
      setError('无法保存创作描述，请检查浏览器存储权限。'); return;
    }
    onClose();
    openCreatePageWithAuth({ mode: 'fresh' });
  };
  return <dialog ref={dialog} className="cw-dialog cw-failed-dialog" aria-label="任务详情" onCancel={onClose} onClose={onClose}>
    <div className="cw-dialog-head"><div><h2>{work.title || '未完成的创作'}</h2><p>本次任务未完成。查看详情不会重新执行任务。</p></div><button type="button" onClick={onClose} aria-label="关闭任务详情">×</button></div>
    <div className="cw-publish-body">
      {loading && <p role="status">正在读取任务详情…</p>}
      {reason && <p role="alert">{String(reason)}</p>}
      {!loading && !reason && !error && <p>服务未返回具体失败原因，可在任务中心查看执行记录。</p>}
      {error && <p role="alert">{error}</p>}
      {(task?.failedStage || task?.progressStage) && <p>停止阶段：{task.failedStage || task.progressStage}</p>}
      <p>{work.description}</p>
    </div>
    <div className="cw-dialog-foot"><span>原任务保留；开始新创作前可以修改描述。</span><button type="button" className="cw-button cw-primary" onClick={restart}>修改描述并重新创作</button></div>
  </dialog>;
}
