import { formatEnvelopeDate } from '@/domain/dates';
import type { Invitation } from '@/domain/types';

interface EndedViewProps { invitation: Invitation }

const EndedView =({ invitation }: EndedViewProps) => {
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

export default EndedView;
