interface CheckProps {
  color?: string;
  size?: number;
}

const Check = ({ color = "currentColor", size = 24 }: CheckProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
};

export default Check;
