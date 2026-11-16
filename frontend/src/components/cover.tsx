import { eyebrows } from '@/content/copy';
import { Icon } from '@/components/icon';
import { PhotoFrame } from '@/components/photo';
import { ceremonyDateTime, formatCoverWhen, formatMonthDay } from '@/domain/dates';
import type { Invitation } from '@/domain/types';
import { venueLine } from '@/domain/visibility';

export function Cover({ invitation }: { invitation: Invitation }) {
  const photo = invitation.photos[0];
  const when = formatCoverWhen(invitation.ceremony.date, invitation.ceremony.time);
  const place = venueLine(invitation);
  return (
    <header className={`cover ${photo ? '' : 'is-plain'}`} id="cover">
      {photo ? (
        <div className="cover-photo">
          <PhotoFrame
            photo={photo}
            alt={`${invitation.groom.name}과 ${invitation.bride.name}의 웨딩 사진`}
            sizes="(max-width: 430px) 100vw, 430px"
            priority
          />
        </div>
      ) : null}
      <div className="cover-copy">
        <p className="eyebrow" aria-hidden="true">
          {eyebrows.cover}
        </p>
        {photo ? null : <p className="display-date">{formatMonthDay(invitation.ceremony.date)}</p>}
        <h1 className="display-name">
          {invitation.groom.name}
          <span aria-hidden="true"> · </span>
          {invitation.bride.name}
        </h1>
        <p className="body-strong">
          <time dateTime={ceremonyDateTime(invitation.ceremony.date, invitation.ceremony.time)}>{when}</time>
        </p>
        {place ? <p className="text-2">{place}</p> : null}
        <p className="scroll-hint" aria-hidden="true">
          <Icon name="chevron-down" />
        </p>
      </div>
    </header>
  );
}
