import React from 'react';

export const publicationDraftFor = work => ({ title: work?.title || '', description: work?.description || '' });
export const isPublicationReady = draft => draft?.title?.trim().length >= 3 && draft?.description?.trim().length >= 10;

export default function PublicationFields({ draft, onChange, disabled = false }) {
  return <div className="publication-fields" style={{display:'grid',gap:14,margin:'18px 0'}}>
    <label style={{display:'grid',gap:6}}>发布名称<input className="dialog-input" value={draft.title} disabled={disabled} onChange={e => onChange({...draft,title:e.target.value})} minLength={3} required style={{boxSizing:'border-box',width:'100%'}} /></label>
    <label style={{display:'grid',gap:6}}>作品简介<textarea className="dialog-input" value={draft.description} disabled={disabled} onChange={e => onChange({...draft,description:e.target.value})} minLength={10} required rows={4} style={{boxSizing:'border-box',width:'100%',resize:'vertical'}} /></label>
    <small>名称至少 3 个字，简介至少 10 个字。介绍作品内容和玩法，发布后将展示在创意广场。</small>
  </div>;
}
