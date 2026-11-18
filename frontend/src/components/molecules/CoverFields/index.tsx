'use client';

import { formatKoreanTime } from '@/domain/dates';
import { setCeremonyDate, setCoupleName } from '@/domain/editor';
import Field, { describedBy } from '@/components/atoms/Field';
import { GivenSuggestion, issueText, times, type FormBag } from '@/components/molecules/editorForm/shared';

type CoverFieldsProps = FormBag;

const CoverFields = ({ draft, issues, reveal, onChange }: CoverFieldsProps) => {
  const invitation = draft.invitation;
  const groomError = issueText(issues, 'groom-name', reveal);
  const brideError = issueText(issues, 'bride-name', reveal);
  const dateError = issueText(issues, 'ceremony-date', reveal);
  const timeError = issueText(issues, 'ceremony-time', reveal);
  const venueError = issueText(issues, 'venue', reveal);
  return (
    <>
      <Field id="groom-name" label="신랑 이름" required error={groomError} hint="2자에서 10자, 성을 포함해 주세요">
        <input id="groom-name" value={invitation.groom.name} maxLength={10} aria-invalid={Boolean(groomError)} aria-describedby={describedBy(groomError, 'groom-name')} onChange={(event) => onChange(setCoupleName(draft, 'groom', event.target.value))} />
      </Field>
      <Field id="bride-name" label="신부 이름" required error={brideError}>
        <input id="bride-name" value={invitation.bride.name} maxLength={10} aria-invalid={Boolean(brideError)} aria-describedby={describedBy(brideError, 'bride-name')} onChange={(event) => onChange(setCoupleName(draft, 'bride', event.target.value))} />
      </Field>
      <div className="ed-row">
        <Field id="groom.givenName" label="서명에 쓸 이름" required error={issueText(issues, 'groom.givenName', reveal)} hint="인사말 아래에 들어가요">
          <input id="groom.givenName" value={invitation.groom.givenName} maxLength={10} aria-invalid={Boolean(issueText(issues, 'groom.givenName', reveal))} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, groom: { ...invitation.groom, givenName: event.target.value } } })} />
          <GivenSuggestion name={invitation.groom.name} givenName={invitation.groom.givenName} onUse={(givenName) => onChange({ ...draft, invitation: { ...invitation, groom: { ...invitation.groom, givenName } } })} />
        </Field>
        <Field id="bride.givenName" label="신부 서명 이름" required error={issueText(issues, 'bride.givenName', reveal)}>
          <input id="bride.givenName" value={invitation.bride.givenName} maxLength={10} aria-invalid={Boolean(issueText(issues, 'bride.givenName', reveal))} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, bride: { ...invitation.bride, givenName: event.target.value } } })} />
          <GivenSuggestion name={invitation.bride.name} givenName={invitation.bride.givenName} onUse={(givenName) => onChange({ ...draft, invitation: { ...invitation, bride: { ...invitation.bride, givenName } } })} />
        </Field>
      </div>
      <div className="ed-row">
        <Field id="ceremony-date" label="예식 날짜" required error={dateError}>
          <input id="ceremony-date" type="date" value={invitation.ceremony.date} aria-invalid={Boolean(dateError)} aria-describedby={describedBy(dateError, 'ceremony-date')} onChange={(event) => onChange(setCeremonyDate(draft, event.target.value))} />
        </Field>
        <Field id="ceremony-time" label="예식 시간" required error={timeError}>
          <select id="ceremony-time" value={invitation.ceremony.time ?? ''} aria-invalid={Boolean(timeError)} aria-describedby={describedBy(timeError, 'ceremony-time')} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, ceremony: { ...invitation.ceremony, time: event.target.value || undefined } } })}>
            <option value="">시간을 골라 주세요</option>
            {times(invitation.ceremony.time).map((time) => (
              <option key={time} value={time}>
                {formatKoreanTime(time)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="venue" label="예식장 이름" required error={venueError}>
        <input id="venue" value={invitation.ceremony.venueName} maxLength={30} aria-invalid={Boolean(venueError)} aria-describedby={describedBy(venueError, 'venue')} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, ceremony: { ...invitation.ceremony, venueName: event.target.value } } })} />
      </Field>
      <Field id="hall" label="홀 이름" hint="비워 두면 예식장 이름만 보여요" error={issueText(issues, 'hall', true)}>
        <input id="hall" value={invitation.ceremony.hall ?? ''} maxLength={20} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, ceremony: { ...invitation.ceremony, hall: event.target.value } } })} />
      </Field>
    </>
  );
}

export default CoverFields;
