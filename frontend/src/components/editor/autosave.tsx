'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  autosaveDelay,
  clearDirtyClock,
  markDirty,
  type AutosaveClock,
  type EditorDraft,
} from '@/domain/editor';
import type { AutosaveBody, AutosaveResult, EditorInvitation, EditorPhoto } from '@/editor/contract';
import { draftFromInvitation } from '@/editor/document';
import { withPhoto } from '@/editor/etag';
import { planAutosave } from '@/editor/patch';

export type SaveStatus = { kind: 'saved'; at: string } | { kind: 'saving' } | { kind: 'offline' } | { kind: 'error'; failures: number };

export function savedLabel(at: string, now: Date): string {
  const delta = now.getTime() - new Date(at).getTime();
  if (Number.isNaN(delta) || delta < 60_000) return '방금 저장';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes}분 전 저장`;
  return `${Math.floor(minutes / 60)}시간 전 저장`;
}

export function useAutosave(save: (id: string, body: AutosaveBody, ifMatch: string) => Promise<AutosaveResult>, onReplace: (draft: EditorDraft) => void) {
  const [status, setStatus] = useState<SaveStatus>({ kind: 'saved', at: '' });
  const [conflict, setConflict] = useState<EditorDraft | null>(null);
  const [holdSaved, setHoldSaved] = useState(false);
  const base = useRef('');
  const saved = useRef<EditorInvitation | null>(null);
  const clock = useRef<AutosaveClock>(clearDirtyClock());
  const timer = useRef<number | null>(null);
  const draftRef = useRef<EditorDraft | null>(null);
  const failures = useRef(0);
  const saving = useRef(false);
  const queued = useRef(false);
  const saveRef = useRef(save);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  saveRef.current = save;

  function bind(draft: EditorDraft, invitation: EditorInvitation) {
    draftRef.current = draft;
    saved.current = invitation;
    base.current = invitation.etag;
    clock.current = clearDirtyClock();
    failures.current = 0;
    setConflict(null);
    setStatus(navigator.onLine ? { kind: 'saved', at: invitation.updatedAt } : { kind: 'offline' });
  }

  function noteServer(invitation: EditorInvitation) {
    saved.current = invitation;
    base.current = invitation.etag;
  }

  function notePhoto(etag: string, photo: EditorPhoto) {
    if (!saved.current) return;
    saved.current = withPhoto(saved.current, photo, etag);
    base.current = saved.current.etag;
  }

  function touch(next: EditorDraft) {
    draftRef.current = next;
    clock.current = markDirty(clock.current, Date.now());
    const delay = autosaveDelay(clock.current, Date.now(), AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS);
    if (delay === null) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), delay);
  }

  async function flush() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const current = draftRef.current;
    const api = saveRef.current;
    const server = saved.current;
    if (!current || !server || clock.current.firstDirtyAt === null) return;
    if (saving.current) {
      queued.current = true;
      return;
    }
    const body = planAutosave(server, current);
    if (!body) {
      clock.current = clearDirtyClock();
      return;
    }
    saving.current = true;
    const offline = navigator.onLine === false;
    setStatus(offline ? { kind: 'offline' } : { kind: 'saving' });
    const baseAt = base.current;
    clock.current = clearDirtyClock();
    let result;
    try {
      result = await api(current.invitation.id, body, baseAt);
    } catch {
      result = { ok: false as const, code: 'failed' as const };
    }
    saving.current = false;
    if (result.ok) {
      saved.current = result.invitation;
      base.current = result.invitation.etag;
      failures.current = 0;
      setHoldSaved(true);
      window.setTimeout(() => setHoldSaved(false), 2000);
      setStatus(navigator.onLine ? { kind: 'saved', at: result.invitation.updatedAt } : { kind: 'offline' });
    } else if (result.code === 'conflict') {
      saved.current = result.invitation;
      setConflict(draftFromInvitation(result.invitation));
      setStatus({ kind: 'error', failures: failures.current });
    } else {
      failures.current += 1;
      clock.current = markDirty(clearDirtyClock(), Date.now());
      setStatus({ kind: 'error', failures: failures.current });
    }
    if (queued.current || clock.current.firstDirtyAt !== null) {
      queued.current = false;
      if (clock.current.firstDirtyAt !== null) void flush();
    }
  }

  flushRef.current = flush;

  useEffect(() => {
    const onLine = () => {
      if (clock.current.firstDirtyAt !== null) void flushRef.current();
      else if (base.current) setStatus({ kind: 'saved', at: base.current });
    };
    window.addEventListener('online', onLine);
    const warn = (event: BeforeUnloadEvent) => {
      if (clock.current.firstDirtyAt === null) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('online', onLine);
      window.removeEventListener('beforeunload', warn);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function keepMine() {
    if (!conflict || !saved.current) return;
    base.current = saved.current.etag;
    setConflict(null);
    clock.current = markDirty(clearDirtyClock(), Date.now());
    void flush();
  }

  function takeTheirs() {
    const server = saved.current;
    if (!conflict || !server) return;
    const theirs = draftFromInvitation(server);
    setConflict(null);
    bind(theirs, server);
    onReplace(theirs);
  }

  return { status, conflict, holdSaved, bind, noteServer, notePhoto, touch, flush, keepMine, takeTheirs, dirty: () => clock.current.firstDirtyAt !== null };
}
