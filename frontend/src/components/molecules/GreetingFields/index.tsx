'use client';

import { useState } from 'react';
import { GREETING_MAX } from '@/domain/editor';
import { greetingExamples } from '@/editor/themes';
import Field, { describedBy } from '@/components/atoms/Field';
import Sheet from '@/components/molecules/Sheet';
import { issueText, type FormBag } from '@/components/molecules/editorForm/shared';

type GreetingFieldsProps = FormBag;

const GreetingFields = ({ draft, issues, onChange }: GreetingFieldsProps) => {
  const [examples, setExamples] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const value = draft.invitation.greeting ?? '';
  const error = issueText(issues, 'greeting', true);
  return (
    <>
      <Field id="greeting" label="인사말" error={error} hint="비워 두면 인사말 섹션은 초대장에 보이지 않아요">
        <textarea id="greeting" value={value} maxLength={GREETING_MAX} aria-invalid={Boolean(error)} aria-describedby={describedBy(error, 'greeting')} onChange={(event) => onChange({ ...draft, invitation: { ...draft.invitation, greeting: event.target.value } })} />
      </Field>
      <p className={`ed-counter ${value.length >= GREETING_MAX ? 'is-error' : ''}`}>{value.length} / {GREETING_MAX}</p>
      <button type="button" className="ed-btn-secondary" onClick={() => setExamples(true)}>예시 문구 넣기</button>
      {examples ? (
        <Sheet title="예시 문구" onClose={() => setExamples(false)}>
          <div className="ed-stack">
            {greetingExamples.map((example) => (
              <button key={example.slice(0, 12)} type="button" className="ed-card" onClick={() => { setPending(example); setExamples(false); }}>
                {example}
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
      {pending !== null ? (
        <Sheet title="예시 문구로 바꿀까요?" onClose={() => setPending(null)}>
          <p>지금 적은 인사말을 덮어써요.</p>
          <div className="ed-inline">
            <button type="button" className="ed-btn" onClick={() => { onChange({ ...draft, invitation: { ...draft.invitation, greeting: pending } }); setPending(null); }}>바꾸기</button>
            <button type="button" className="ed-btn-secondary" onClick={() => setPending(null)}>취소</button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

export default GreetingFields;
