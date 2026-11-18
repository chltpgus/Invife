'use client';

import { useState } from 'react';
import { splitAddress } from '@/domain/editor';
import Field, { describedBy } from '@/components/atoms/Field';
import Sheet from '@/components/molecules/Sheet';
import { issueText, setAddress, setTransport, TransportField, type FormBag } from '@/components/molecules/editorForm/shared';

type DirectionFieldsProps = FormBag;

const DirectionFields = ({ draft, issues, reveal, onChange }: DirectionFieldsProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(splitAddress(draft.invitation.ceremony.address).road);
  const address = splitAddress(draft.invitation.ceremony.address);
  const error = issueText(issues, 'address', reveal);
  const detailError = issueText(issues, 'address-detail', true);
  const transport = draft.invitation.transport ?? {};
  return (
    <>
      <Field id="address" label="주소" required error={error} hint="좌표 변환은 주소 검색 API가 연결되면 지도에 표시돼요. 지금은 주소만 초대장에 나와요.">
        <input id="address" readOnly value={address.road} aria-invalid={Boolean(error)} aria-describedby={describedBy(error, 'address')} onClick={() => setOpen(true)} />
      </Field>
      <button type="button" className="ed-btn-secondary" onClick={() => setOpen(true)}>주소 검색</button>
      <Field id="address-detail" label="상세 주소" error={detailError} hint="비워 두면 생략돼요">
        <input id="address-detail" value={address.detail} maxLength={40} onChange={(event) => onChange(setAddress(draft, address.road, event.target.value))} />
      </Field>
      <TransportField id="parking" label="주차" value={transport.parking ?? ''} error={issueText(issues, 'parking', true)} onChange={(value) => onChange(setTransport(draft, 'parking', value))} />
      <TransportField id="subway" label="지하철" value={transport.subway ?? ''} error={issueText(issues, 'subway', true)} onChange={(value) => onChange(setTransport(draft, 'subway', value))} />
      <TransportField id="bus" label="버스" value={transport.bus ?? ''} error={issueText(issues, 'bus', true)} onChange={(value) => onChange(setTransport(draft, 'bus', value))} />
      <TransportField id="other" label="기타 안내" value={transport.other ?? ''} error={issueText(issues, 'other', true)} onChange={(value) => onChange(setTransport(draft, 'other', value))} />
      <p className="ed-hint">교통 안내를 모두 비우면 그 블록은 숨겨져요.</p>
      {open ? (
        <Sheet title="주소 검색" onClose={() => setOpen(false)}>
          <Field id="address-query" label="도로명 주소">
            <input id="address-query" value={query} onChange={(event) => setQuery(event.target.value)} />
          </Field>
          <p className="ed-hint">지도에서 위치를 찾지 못해도 주소는 그대로 초대장에 보여요.</p>
          <button type="button" className="ed-btn" onClick={() => { onChange(setAddress(draft, query, address.detail)); setOpen(false); }}>이 주소 사용</button>
        </Sheet>
      ) : null}
    </>
  );
}

export default DirectionFields;
