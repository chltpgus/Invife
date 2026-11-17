import { eyebrows } from '@/content/copy';
import { Icon } from '@/components/icon';
import { PhotoFrame } from '@/components/photo';
import { ceremonyDateTime, formatCoverWhen, formatMonthDay } from '@/domain/dates';
import type { Invitation } from '@/domain/types';
import { venueLine } from '@/domain/visibility';

function Sample({ value, fallback, preview }: { value: string; fallback: string; preview: boolean }) {
  if (value) return <>{value}</>;
  if (preview) return <span className="sample-text">{fallback}</span>;
  return null;
}

export function Cover({ invitation, preview = false }: { invitation: Invitation; preview?: boolean }) {
  const photo = invitation.photos[0];
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(invitation.ceremony.date);
  const when = dateOk ? formatCoverWhen(invitation.ceremony.date, invitation.ceremony.time) : '';
  const place = venueLine(invitation).trim();
  const groom = invitation.groom.name.trim();
  const bride = invitation.bride.name.trim();
  return (
    <header className={`cover ${photo ? '' : 'is-plain'}`} id="cover">
      {photo ? (
        <div className="cover-photo">
          <PhotoFrame
            photo={photo}
            alt={`${groom || '신랑'}과 ${bride || '신부'}의 웨딩 사진`}
            sizes="(max-width: 430px) 100vw, 430px"
            priority
          />
        </div>
      ) : null}
      <div className="cover-copy">
        <p className="eyebrow" aria-hidden="true">
          {eyebrows.cover}
        </p>
        {photo ? null : dateOk ? <p className="display-date">{formatMonthDay(invitation.ceremony.date)}</p> : preview ? <p className="display-date sample-text">00.00</p> : null}
        <h1 className="display-name">
          <Sample value={groom} fallback="신랑 이름" preview={preview} />
          <span aria-hidden="true"> · </span>
          <Sample value={bride} fallback="신부 이름" preview={preview} />
        </h1>
        {when ? (
          <p className="body-strong">
            <time dateTime={ceremonyDateTime(invitation.ceremony.date, invitation.ceremony.time)}>{when}</time>
          </p>
        ) : preview ? (
          <p className="body-strong sample-text">예식 날짜</p>
        ) : null}
        {place ? <p className="text-2">{place}</p> : preview ? <p className="sample-text text-2">예식장</p> : null}
        <p className="scroll-hint" aria-hidden="true">
          <Icon name="chevron-down" />
        </p>
      </div>
    </header>
  );
}
