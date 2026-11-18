'use client';

import { resetDeadline, setDeadline, splitKst } from '@/domain/editor';
import Field from '@/components/atoms/Field';
import { issueText, type FormBag } from '@/components/molecules/editorForm/shared';

type RsvpFieldsProps = FormBag;

const RsvpFields = ({ draft, issues, onChange }: RsvpFieldsProps) => {
  const parts = splitKst(draft.invitation.rsvp.deadline);
  const error = issueText(issues, 'deadline', true);
  const dateReady = /^\d{4}-\d{2}-\d{2}$/.test(draft.invitation.ceremony.date);
  return (
    <>
      <p className="ed-hint">마감은 항상 있어요. 기본은 예식 전날 23:59예요.</p>
      <div className="ed-row">
        <Field id="deadline-date" label="응답 마감 날짜" error={error}>
          <input id="deadline-date" type="date" disabled={!dateReady} value={parts?.date ?? ''} aria-invalid={Boolean(error)} onChange={(event) => onChange(setDeadline(draft, event.target.value, parts?.time ?? '23:59'))} />
        </Field>
        <Field id="deadline-time" label="응답 마감 시간">
          <input id="deadline-time" type="time" step={60} disabled={!dateReady} value={parts?.time ?? ''} onChange={(event) => onChange(setDeadline(draft, parts?.date ?? draft.invitation.ceremony.date, event.target.value))} />
        </Field>
      </div>
      <button type="button" className="ed-btn-secondary" disabled={!dateReady} onClick={() => onChange(resetDeadline(draft))}>예식 전날 밤 12시</button>
      <p className="ed-hint">하객은 마감 전까지 응답을 고칠 수 있어요. 본인 제외 최대 10명까지 받아요.</p>
      <p className="ed-hint">공용 RSVP 링크는 발행하면 만들어져요.</p>
    </>
  );
}

export default RsvpFields;
