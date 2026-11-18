interface CalendarProps {
  color?: string;
  size?: number;
}

const Calendar = ({ color = "currentColor", size = 24 }: CalendarProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <rect x="3.5" y="5" width="17" height="15" rx="1" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
    </svg>
  );
};

export default Calendar;
