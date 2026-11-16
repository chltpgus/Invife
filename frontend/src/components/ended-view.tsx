import { formatEnvelopeDate } from '@/domain/dates';
import type { Invitation } from '@/domain/types';

export function EndedView({ invitation }: { invitation: Invitation }) {
  return (
    <div className="column ended" data-theme={invitation.theme}>
      <p className="display-name">
        {invitation.groom.name} · {invitation.bride.name}
      </p>
      <p className="display-date">{formatEnvelopeDate(invitation.ceremony.date)}</p>
      <p>결혼식을 잘 마쳤어요. 축하해 주셔서 감사합니다.</p>
    </div>
  );
}

export function NotFoundView() {
  return (
    <div className="column ended" data-theme="ivory">
      <p className="eyebrow" aria-hidden="true">
        Invife
      </p>
      <h1 className="heading">초대장을 찾을 수 없어요</h1>
      <p className="text-2">링크가 바뀌었거나 초대장이 내려갔어요. 보내주신 분께 링크를 다시 받아 주세요.</p>
    </div>
  );
}
