'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { eyebrows } from '@/content/copy';
import { Icon } from '@/components/icon';
import { deadlineCaption, isDeadlineClosed } from '@/domain/dates';
import {
  canSubmitRsvp,
  companionsToSend,
  COMPANION_MAX,
  editStorageKey,
  initialPhase,
  needsTurnstile,
  normalizeGuestName,
  phaseAfterResult,
  readStoredEdit,
  responseSummary,
  submitLabel,
  validateGuestName,
  type RsvpPhase,
} from '@/domain/rsvp';
import type { GuestLink, Invitation, RsvpResponse } from '@/domain/types';
import { env } from '@/env';
import { browserStore } from '@/rsvp/client';
import { createRsvpClient } from '@/rsvp/create-client';

export function RsvpSection({
  invitation,
  link,
  hasContact,
  onMissing,
}: {
  invitation: Invitation;
  link: GuestLink;
  hasContact: boolean;
  onMissing: () => void;
}) {
  const client = useRef(createRsvpClient()).current;
  const store = useRef(browserStore()).current;
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [deadline, setDeadline] = useState(invitation.rsvp.deadline);
  const [closed, setClosed] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [prefillName, setPrefillName] = useState('');
  const [response, setResponse] = useState<RsvpResponse | null>(null);
  const [editKey, setEditKey] = useState<string | undefined>();
  const token = link.channel === 'invite' ? undefined : link.token;

  useEffect(() => {
    let live = true;
    void client.context({ slug: invitation.slug, token }).then((result) => {
      if (!live) return;
      if (!result.ok) {
        if (result.code === 'not_found') onMissing();
        else setUnavailable(true);
        setReady(true);
        return;
      }
      const context = result.context;
      setDeadline(context.deadline);
      setClosed(context.status === 'closed' || isDeadlineClosed(new Date(), context.deadline));
      setRevoked(Boolean(context.revoked));
      setPrefillName(context.revoked ? '' : (context.prefillName ?? ''));
      if (context.revoked) {
        setResponse(null);
      } else if (context.link === 'personal') {
        setResponse(context.response ?? null);
      } else {
        const stored = readStoredEdit(store.get(editStorageKey(invitation.slug, context.link, token)));
        setResponse(stored?.response ?? null);
        setEditKey(stored?.editKey);
      }
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [client, invitation.slug, link.channel, token, onMissing, store]);

  return (
    <section className="section" id="rsvp" aria-labelledby="rsvp-title">
      <p className="eyebrow" aria-hidden="true">
        {eyebrows.rsvp}
      </p>
      <h2 id="rsvp-title" className="heading">
        참석 여부
      </h2>
      {ready ? (
        <RsvpForm
          invitation={invitation}
          link={link}
          hasContact={hasContact}
          deadline={deadline}
          closed={closed}
          revoked={revoked}
          prefillName={prefillName}
          initialResponse={response}
          initialEditKey={editKey}
          unavailable={unavailable}
          onRevoked={() => {
            setRevoked(true);
            setPrefillName('');
            setResponse(null);
            setEditKey(undefined);
          }}
          onMissing={onMissing}
        />
      ) : (
        <p className="caption">참석 여부를 확인하고 있어요</p>
      )}
    </section>
  );
}

function RsvpForm({
  invitation,
  link,
  hasContact,
  deadline,
  closed,
  revoked,
  prefillName,
  initialResponse,
  initialEditKey,
  unavailable,
  onRevoked,
  onMissing,
}: {
  invitation: Invitation;
  link: GuestLink;
  hasContact: boolean;
  deadline: string;
  closed: boolean;
  revoked: boolean;
  prefillName: string;
  initialResponse: RsvpResponse | null;
  initialEditKey?: string;
  unavailable: boolean;
  onRevoked: () => void;
  onMissing: () => void;
}) {
  const client = useRef(createRsvpClient()).current;
  const store = useRef(browserStore()).current;
  const [response, setResponse] = useState(initialResponse);
  const [editKey, setEditKey] = useState(initialEditKey);
  const [phase, setPhase] = useState<RsvpPhase>(() =>
    unavailable
      ? { name: 'form', intent: 'create', banner: 'unavailable', submitting: false, nameError: null }
      : initialPhase(closed, revoked ? null : initialResponse),
  );
  const [attending, setAttending] = useState<boolean | null>(initialResponse && !revoked ? initialResponse.attending : null);
  const [companions, setCompanions] = useState(initialResponse && !revoked ? initialResponse.companions : 0);
  const [name, setName] = useState(revoked ? '' : initialResponse?.name || prefillName);
  const [editingName, setEditingName] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileError, setTurnstileError] = useState(false);
  const [widgetKey, setWidgetKey] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const nameId = useId();
  const errorId = useId();
  const personalPrefill = link.channel === 'personal' && !revoked && Boolean(prefillName);
  const turnstile = needsTurnstile(link, revoked) && Boolean(env.turnstileSiteKey);
  const caption = deadlineCaption(deadline);
  const summary = response ? responseSummary(response, true) : '';

  useEffect(() => {
    if (phase.name === 'success') resultRef.current?.focus();
    if (phase.name === 'form' && phase.banner !== 'none') bannerRef.current?.focus();
    if (phase.name === 'form' && phase.nameError) nameRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  function remember(next: RsvpResponse, key: string | undefined) {
    if (link.channel === 'personal' || !key) return;
    store.set(
      editStorageKey(invitation.slug, link.channel, link.channel === 'rsvp_link' ? link.token : undefined),
      JSON.stringify({ responseId: next.id, editKey: key, response: next }),
    );
  }

  function beginEdit() {
    if (!response) return;
    setAttending(response.attending);
    setCompanions(response.companions);
    setName(response.name);
    setEditingName(link.channel !== 'personal');
    setPhase({ name: 'form', intent: 'edit', banner: 'none', submitting: false, nameError: null });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase.name !== 'form' || !canSubmitRsvp(attending, phase.submitting) || attending === null) return;
    const nameError = validateGuestName(name);
    if (nameError) {
      setEditingName(true);
      setPhase({ ...phase, nameError, banner: 'none' });
      return;
    }
    if (turnstile && !turnstileToken) {
      setTurnstileError(true);
      return;
    }
    setPhase({ ...phase, submitting: true, nameError: null, banner: 'none' });
    const result = await client.submit({
      slug: invitation.slug,
      channel: link.channel,
      token: link.channel === 'invite' ? undefined : link.token,
      name: normalizeGuestName(name),
      attending,
      companions: companionsToSend(attending, companions),
      responseId: phase.intent === 'edit' ? response?.id : undefined,
      editKey: phase.intent === 'edit' && link.channel !== 'personal' ? editKey : undefined,
      turnstileToken: turnstileToken || undefined,
    });
    if (result.ok) {
      const key = result.editKey ?? editKey;
      setResponse(result.response);
      if (key) setEditKey(key);
      remember(result.response, key);
    }
    if (!result.ok && result.code === 'revoked') {
      onRevoked();
      setResponse(null);
      setName('');
      setEditingName(false);
      setAttending(null);
      setCompanions(0);
      setTurnstileToken('');
      setWidgetKey((value) => value + 1);
    }
    if (!result.ok && result.code === 'turnstile_failed') {
      setTurnstileToken('');
      setWidgetKey((value) => value + 1);
      setTurnstileError(true);
    }
    if (!result.ok && result.code === 'not_found') {
      onMissing();
      return;
    }
    const next = phaseAfterResult(result, phase.intent === 'edit');
    if (next) setPhase(next);
  }

  return (
    <>
      {phase.name === 'closed' ? (
        <div className="result-card">
          {response && !revoked ? (
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
              {bannerText(phase)}
            </p>
          ) : null}
          {phase.intent === 'edit' && response ? <p className="caption">이전 응답: {summary}</p> : null}
          {personalPrefill && !editingName ? (
            <div className="name-preset">
              <p className="body-strong">{prefillName} 님으로 응답해요</p>
              <button type="button" className="btn-text" onClick={() => setEditingName(true)}>
                {prefillName} 님이 아니신가요?
              </button>
            </div>
          ) : (
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
          )}
          <div className="choices" role="radiogroup" aria-label="참석 여부">
            <label className="choice">
              <input type="radio" name={`${invitation.id}-attending`} checked={attending === true} onChange={() => setAttending(true)} />
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
          {turnstile ? (
            <Turnstile key={widgetKey} siteKey={env.turnstileSiteKey} onToken={setTurnstileToken} error={turnstileError || phase.banner === 'turnstile'} />
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={!canSubmitRsvp(attending, phase.submitting)}>
            {phase.submitting ? (
              <span className="spin">
                <Icon name="spinner" size={18} />
              </span>
            ) : null}
            {submitLabel(phase)}
          </button>
          {phase.intent === 'edit' ? (
            <button type="button" className="btn-text" onClick={() => setPhase({ name: 'success', edited: false })}>
              취소
            </button>
          ) : null}
        </form>
      ) : null}
    </>
  );
}

function bannerText(phase: Extract<RsvpPhase, { name: 'form' }>): string {
  if (phase.banner === 'rate_limited') {
    return phase.retryAfter ? `잠시 후 다시 시도해 주세요. ${phase.retryAfter}초 뒤예요.` : '잠시 후 다시 시도해 주세요';
  }
  if (phase.banner === 'unavailable') return '지금은 응답을 받을 수 없어요. 잠시 후 다시 시도해 주세요.';
  if (phase.banner === 'edit_forbidden') return '이 기기에서는 응답을 수정할 수 없어요.';
  if (phase.banner === 'turnstile') return '확인을 다시 해 주세요.';
  if (phase.banner === 'validation') return '입력한 내용을 확인해 주세요.';
  return '전달하지 못했어요. 입력한 내용은 그대로 있어요.';
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
