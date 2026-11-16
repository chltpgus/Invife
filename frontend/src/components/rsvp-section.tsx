'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { siteConfig } from '@/config';
import { sharedInvitationRsvpNote, eyebrows } from '@/content/copy';
import { Icon } from '@/components/icon';
import { deadlineCaption, isDeadlineClosed } from '@/domain/dates';
import {
  canSubmitRsvp,
  companionsToSend,
  COMPANION_MAX,
  initialPhase,
  linkToken,
  phaseAfterResult,
  requiresGuestName,
  responseSummary,
  storageKeyFor,
  submitLabel,
  summaryShowsName,
  validateGuestName,
  type RsvpPhase,
} from '@/domain/rsvp';
import type { FixtureRsvpMode, GuestView, Invitation, RsvpResponse } from '@/domain/types';
import { env } from '@/env';
import { createRsvpClient } from '@/rsvp/create-client';

export function RsvpSection({
  invitation,
  view,
  mode,
  now,
  hasContact,
}: {
  invitation: Invitation;
  view: GuestView;
  mode: FixtureRsvpMode;
  now: string;
  hasContact: boolean;
}) {
  if (view.kind === 'shared-invitation' && view.rsvp === 'notice') {
    return (
      <section className="section" id="rsvp" aria-labelledby="rsvp-title">
        <p className="eyebrow" aria-hidden="true">
          {eyebrows.rsvp}
        </p>
        <h2 id="rsvp-title" className="heading">
          참석 여부
        </h2>
        <p className="text-2">{sharedInvitationRsvpNote}</p>
      </section>
    );
  }
  return <RsvpForm invitation={invitation} view={view} mode={mode} now={now} hasContact={hasContact} />;
}

function RsvpForm({
  invitation,
  view,
  mode,
  now,
  hasContact,
}: {
  invitation: Invitation;
  view: GuestView;
  mode: FixtureRsvpMode;
  now: string;
  hasContact: boolean;
}) {
  const preset = view.kind === 'personal' ? view.name : '';
  const seeded = view.kind === 'personal' ? view.response : null;
  const closed = isDeadlineClosed(new Date(now), invitation.rsvp.deadline);
  const client = useRef(createRsvpClient(mode)).current;
  const storageKey = storageKeyFor(invitation.id, view);
  const [response, setResponse] = useState<RsvpResponse | null>(seeded);
  const [phase, setPhase] = useState<RsvpPhase>(() => initialPhase(closed, seeded));
  const [attending, setAttending] = useState<boolean | null>(seeded ? seeded.attending : null);
  const [companions, setCompanions] = useState(seeded?.companions ?? 0);
  const [name, setName] = useState(seeded?.name || preset);
  const [editingName, setEditingName] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileError, setTurnstileError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const nameId = useId();
  const errorId = useId();
  const required = requiresGuestName(view, siteConfig.rsvpNameMode);
  const prefill = view.kind === 'personal' && siteConfig.rsvpNameMode === 'prefill-input';
  const showName = view.kind === 'personal' && siteConfig.rsvpNameMode === 'show-name';
  const needsTurnstile = view.kind === 'shared-rsvp' && Boolean(env.turnstileSiteKey);
  const caption = deadlineCaption(invitation.rsvp.deadline);

  useEffect(() => {
    if (closed) setPhase({ name: 'closed' });
  }, [closed]);

  useEffect(() => {
    let live = true;
    void client.read(storageKey).then((stored) => {
      if (!live || !stored) return;
      setResponse(stored);
      setName(stored.name || preset);
      setAttending(stored.attending);
      setCompanions(stored.companions);
      setPhase(initialPhase(isDeadlineClosed(new Date(), invitation.rsvp.deadline), stored));
    });
    return () => {
      live = false;
    };
  }, [client, invitation.rsvp.deadline, preset, storageKey]);

  useEffect(() => {
    if (phase.name === 'success') resultRef.current?.focus();
    if (phase.name === 'form' && phase.banner !== 'none') bannerRef.current?.focus();
    if (phase.name === 'form' && phase.nameError) nameRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  function beginEdit() {
    if (!response) return;
    setAttending(response.attending);
    setCompanions(response.companions);
    setName(response.name || preset);
    setEditingName(true);
    setPhase({ name: 'form', intent: 'edit', banner: 'none', submitting: false, nameError: null });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase.name !== 'form' || !canSubmitRsvp(attending, phase.submitting) || attending === null) return;
    const nameError = validateGuestName(name, required);
    if (nameError) {
      setEditingName(true);
      setPhase({ ...phase, nameError, banner: 'none' });
      return;
    }
    if (needsTurnstile && !turnstileToken) {
      setTurnstileError(true);
      return;
    }
    setPhase({ ...phase, submitting: true, nameError: null, banner: 'none' });
    const result = await client.submit({
      slug: invitation.slug,
      linkType: view.kind,
      token: linkToken(view),
      name: required ? name.trim() : undefined,
      attending,
      companions: companionsToSend(attending, companions),
      responseId: phase.intent === 'edit' ? response?.id : undefined,
      turnstileToken: turnstileToken || undefined,
    });
    if (result.ok) {
      client.remember(storageKey, result.response);
      setResponse(result.response);
    }
    const next = phaseAfterResult(result, phase.intent === 'edit');
    if (next) setPhase(next);
  }

  const summary = response ? responseSummary(response, summaryShowsName(view, siteConfig.rsvpNameMode)) : '';

  return (
    <section className="section" id="rsvp" aria-labelledby="rsvp-title">
      <p className="eyebrow" aria-hidden="true">
        {eyebrows.rsvp}
      </p>
      <h2 id="rsvp-title" className="heading">
        참석 여부
      </h2>
      {phase.name === 'closed' ? (
        <div className="result-card">
          {response ? (
            <>
              <h3 className="title-text" tabIndex={-1} ref={resultRef}>
                {summary}
              </h3>
              <p>응답이 마감됐어요</p>
            </>
          ) : (
            <>
              <h3 className="title-text" tabIndex={-1} ref={resultRef}>
                참석 여부 응답이 마감됐어요
              </h3>
              <p className="text-2">변경이 필요하시면 신랑·신부에게 직접 연락해 주세요</p>
              {hasContact ? (
                <a className="btn-text" href="#contact">
                  연락하기
                </a>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {phase.name === 'success' && response ? (
        <div className="result-card">
          <Icon name="check" />
          <h3 className="title-text" tabIndex={-1} ref={resultRef}>
            {phase.edited ? '수정했어요' : '전달했어요'}
          </h3>
          <p>{summary}</p>
          <p className="caption">{caption}</p>
          <button type="button" className="btn btn-secondary" onClick={beginEdit}>
            응답 수정하기
          </button>
        </div>
      ) : null}
      {phase.name === 'form' ? (
        <form className={phase.submitting ? 'is-locked' : undefined} onSubmit={(event) => void onSubmit(event)} noValidate>
          {phase.banner !== 'none' ? (
            <p className="banner" role="alert" tabIndex={-1} ref={bannerRef}>
              <Icon name="alert" size={18} />
              {phase.banner === 'rate_limited' ? '잠시 후 다시 시도해 주세요' : '전달하지 못했어요. 입력한 내용은 그대로 있어요.'}
            </p>
          ) : null}
          {phase.intent === 'edit' && response ? <p className="caption">이전 응답: {summary}</p> : null}
          {showName ? <p className="body-strong">{preset}</p> : null}
          {prefill && !editingName ? (
            <div className="name-preset">
              <p className="body-strong">{preset} 님으로 응답해요</p>
              <button type="button" className="btn-text" onClick={() => setEditingName(true)}>
                {preset} 님이 아니신가요?
              </button>
            </div>
          ) : null}
          {required && (!prefill || editingName) ? (
            <div className="field-block">
              <label className="label-text" htmlFor={nameId}>
                이름
              </label>
              <input
                ref={nameRef}
                id={nameId}
                className={`field ${phase.nameError ? 'is-error' : ''}`}
                value={name}
                placeholder="이름을 입력해 주세요"
                autoComplete="name"
                maxLength={20}
                aria-invalid={phase.nameError ? true : undefined}
                aria-describedby={phase.nameError ? errorId : undefined}
                readOnly={phase.submitting}
                onChange={(event) => setName(event.target.value)}
              />
              {phase.nameError ? (
                <p id={errorId} className="field-error" role="alert">
                  <Icon name="alert" size={16} />
                  {phase.nameError}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="choices" role="radiogroup" aria-label="참석 여부">
            <label className="choice">
              <input
                type="radio"
                name={`${invitation.id}-attending`}
                checked={attending === true}
                onChange={() => setAttending(true)}
              />
              <span>참석</span>
              {attending === true ? <Icon name="check" size={18} /> : null}
            </label>
            <label className="choice">
              <input
                type="radio"
                name={`${invitation.id}-attending`}
                checked={attending === false}
                onChange={() => {
                  setAttending(false);
                  setCompanions(0);
                }}
              />
              <span>불참</span>
              {attending === false ? <Icon name="check" size={18} /> : null}
            </label>
          </div>
          {attending === true ? (
            <div className="stepper">
              <div>
                <p className="label-text">동행 인원</p>
                <p className="caption">(본인 제외)</p>
              </div>
              <div className="stepper-controls">
                <button type="button" className="btn-icon square" aria-label="동행 인원 줄이기" disabled={companions <= 0} onClick={() => setCompanions((value) => value - 1)}>
                  <Icon name="minus" size={18} />
                </button>
                <span className="body-strong nums" aria-live="polite">
                  {companions}명
                </span>
                <button
                  type="button"
                  className="btn-icon square"
                  aria-label="동행 인원 늘리기"
                  disabled={companions >= COMPANION_MAX}
                  onClick={() => setCompanions((value) => value + 1)}
                >
                  <Icon name="plus" size={18} />
                </button>
              </div>
              {companions >= COMPANION_MAX ? <p className="caption">최대 10명까지 함께 오실 수 있어요</p> : null}
            </div>
          ) : null}
          <p className="caption">{caption}</p>
          {needsTurnstile ? <Turnstile siteKey={env.turnstileSiteKey} onToken={setTurnstileToken} error={turnstileError} /> : null}
          <button type="submit" className="btn btn-primary" disabled={!canSubmitRsvp(attending, phase.submitting)}>
            {phase.submitting ? (
              <span className="spin">
                <Icon name="spinner" size={18} />
              </span>
            ) : null}
            {submitLabel(phase)}
          </button>
          {phase.intent === 'edit' ? (
            <button
              type="button"
              className="btn-text"
              onClick={() => setPhase({ name: 'success', edited: false })}
            >
              취소
            </button>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

function Turnstile({ siteKey, onToken, error }: { siteKey: string; onToken: (token: string) => void; error: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const holder = ref.current;
    if (!holder) return;
    let cancelled = false;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      if (cancelled || !window.turnstile || !ref.current) return;
      window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken });
    };
    document.body.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [onToken, siteKey]);
  return (
    <div className="turnstile-slot">
      <div ref={ref} />
      {error ? (
        <p className="field-error" role="alert">
          <Icon name="alert" size={16} />
          확인을 완료해 주세요
        </p>
      ) : null}
    </div>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => void;
    };
  }
}
