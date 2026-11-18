'use client';

import { formatPhone, type EditorDraft } from '@/domain/editor';
import Field, { describedBy } from '@/components/atoms/Field';
import { issueText, parentPhones, type FormBag } from '@/components/molecules/editorForm/shared';

type ContactFieldsProps = FormBag;

const ContactFields = ({ draft, issues, onChange }: ContactFieldsProps) => {
  const rows: Array<{ id: string; label: string; value: string | undefined; disabled: boolean; set: (phone: string) => EditorDraft }> = [
    { id: 'groom.phone', label: draft.invitation.groom.name.trim() || '신랑', value: draft.invitation.groom.phone, disabled: false, set: (phone) => ({ ...draft, invitation: { ...draft.invitation, groom: { ...draft.invitation.groom, phone } } }) },
    { id: 'bride.phone', label: draft.invitation.bride.name.trim() || '신부', value: draft.invitation.bride.phone, disabled: false, set: (phone) => ({ ...draft, invitation: { ...draft.invitation, bride: { ...draft.invitation.bride, phone } } }) },
    ...parentPhones(draft),
  ];
  return (
    <>
      {rows.map((row) => {
        const error = issueText(issues, row.id, true);
        return (
          <Field key={row.id} id={row.id} label={row.label} error={error} hint={row.disabled ? '고인으로 표시돼 연락하기에서 숨겨져요' : undefined}>
            <input id={row.id} inputMode="tel" disabled={row.disabled} value={row.disabled ? '' : (row.value ?? '')} aria-invalid={Boolean(error)} aria-describedby={describedBy(error, row.id)} onChange={(event) => onChange(row.set(formatPhone(event.target.value)))} />
          </Field>
        );
      })}
      <p className="ed-hint">입력한 번호는 초대장을 받은 누구나 볼 수 있어요. 모두 비우면 연락하기는 숨겨져요.</p>
    </>
  );
}

export default ContactFields;
