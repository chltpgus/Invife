interface ClockProps {
  color?: string;
  size?: number;
}

const Clock = ({ color = "currentColor", size = 24 }: ClockProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
    </svg>
  );
};

export default Clock;
