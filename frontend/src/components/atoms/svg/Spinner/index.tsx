interface SpinnerProps {
  color?: string;
  size?: number;
}

const Spinner = ({ color = "currentColor", size = 24 }: SpinnerProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
};

export default Spinner;
