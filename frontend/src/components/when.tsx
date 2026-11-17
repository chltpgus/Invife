import { eyebrows } from '@/content/copy';
import { Reveal } from '@/components/reveal';
import { formatLongDate, formatMonthCaption, formatMonthDay, formatWhenLine, monthGrid, WEEK_KO } from '@/domain/dates';
import type { Invitation } from '@/domain/types';
import { venueLine } from '@/domain/visibility';

export function When({ invitation }: { invitation: Invitation }) {
  const { ceremony } = invitation;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ceremony.date)) return null;
  const grid = monthGrid(ceremony.date);
  const day = Number(ceremony.date.slice(8, 10));
  const line = formatWhenLine(ceremony.date, ceremony.time, venueLine(invitation));
  return (
    <section className="section" id="when" aria-labelledby="when-title">
      <Reveal>
        <p className="eyebrow" aria-hidden="true">
          {eyebrows.date}
        </p>
        <p className="display-date-xl" aria-hidden="true">
          {formatMonthDay(ceremony.date)}
        </p>
        <h2 id="when-title" className="body-strong">
          {formatLongDate(ceremony.date)}
        </h2>
        {line ? <p className="text-2">{line}</p> : null}
        <table className="cal">
          <caption className="title-text">{formatMonthCaption(ceremony.date)}</caption>
          <thead>
            <tr>
              {WEEK_KO.map((name) => (
                <th key={name} scope="col" className="sr-only">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: grid.cells.length / 7 }, (_, week) => (
              <tr key={week}>
                {grid.cells.slice(week * 7, week * 7 + 7).map((value, index) => {
                  const marked = value === day;
                  return (
                    <td key={index} aria-label={marked ? `${grid.month}월 ${value}일 ${WEEK_KO[index]}요일 예식일` : undefined}>
                      {marked ? <span className="cal-mark">{value}</span> : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </section>
  );
}
