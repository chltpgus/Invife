'use client';

import { parentOf } from '@/domain/editor';
import type { Side } from '@/domain/types';
import Field from '@/components/atoms/Field';
import { issueText, setParent, setRelation, type FormBag } from '@/components/molecules/editorForm/shared';

function FamilySide({ draft, side, label, issues, reveal, onChange }: FormBag & { side: Side; label: string }) {
  const family = draft.invitation.families[side];
  const relation = family?.relation ?? (side === 'groom' ? '아들' : '딸');
  return (
    <div className="ed-card">
      <p className="ed-label">{label}</p>
      <Field id={`${side}-relation`} label="관계 표기" hint="아들, 딸, 장남, 차녀">
        <input id={`${side}-relation`} value={relation} maxLength={6} onChange={(event) => onChange(setRelation(draft, side, event.target.value))} />
      </Field>
      <ParentFields draft={draft} side={side} slot="father" label="아버지" issues={issues} reveal={reveal} onChange={onChange} />
      <ParentFields draft={draft} side={side} slot="mother" label="어머니" issues={issues} reveal={reveal} onChange={onChange} />
    </div>
  );
}
function ParentFields({
  draft,
  side,
  slot,
  label,
  issues,
  reveal,
  onChange,
}: FormBag & { side: Side; slot: 'father' | 'mother'; label: string }) {
  const parent = parentOf(draft.invitation, side, slot);
  const styleError = issueText(issues, `${side}-${slot}-style`, reveal);
  return (
    <>
      <Field id={`${side}-${slot}-name`} label={`${label} 이름`} hint="비워 두면 그 이름은 빠져요">
        <input id={`${side}-${slot}-name`} value={parent.name} maxLength={10} onChange={(event) => onChange(setParent(draft, side, slot, { ...parent, name: event.target.value }))} />
      </Field>
      <label className="ed-check">
        <input type="checkbox" checked={Boolean(parent.deceased)} onChange={(event) => onChange(setParent(draft, side, slot, { ...parent, deceased: event.target.checked }))} />
        고인
      </label>
      {parent.deceased ? (
        <fieldset>
          <legend className="ed-label">고인 표기</legend>
          <div className="ed-radios" role="radiogroup" aria-label={`${label} 고인 표기`}>
            <label className="ed-check">
              <input type="radio" name={`${side}-${slot}-style`} checked={parent.deceasedStyle === 'hanja'} onChange={() => onChange(setParent(draft, side, slot, { ...parent, deceased: true, deceasedStyle: 'hanja' }))} />
              故 {parent.name || label}
            </label>
            <label className="ed-check">
              <input type="radio" name={`${side}-${slot}-style`} checked={parent.deceasedStyle === 'hangul'} onChange={() => onChange(setParent(draft, side, slot, { ...parent, deceased: true, deceasedStyle: 'hangul' }))} />
              고 {parent.name || label}
            </label>
          </div>
          {styleError ? <p className="ed-error" role="alert">{styleError}</p> : <p className="ed-hint">고인으로 표시하면 연락하기에서 이 분의 연락처는 보이지 않아요</p>}
        </fieldset>
      ) : null}
    </>
  );
}
type FamilyFieldsProps = FormBag;

const FamilyFields = ({ draft, issues, reveal, onChange }: FamilyFieldsProps) => {
  return (
    <>
      <FamilySide draft={draft} side="groom" label="신랑측" issues={issues} reveal={reveal} onChange={onChange} />
      <FamilySide draft={draft} side="bride" label="신부측" issues={issues} reveal={reveal} onChange={onChange} />
      <p className="ed-hint">양쪽 이름을 모두 비우면 혼주 성함은 초대장에서 숨겨져요.</p>
    </>
  );
}

export default FamilyFields;
