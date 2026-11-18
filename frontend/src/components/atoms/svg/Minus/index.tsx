interface MinusProps {
  color?: string;
  size?: number;
}

const Minus = ({ color = "currentColor", size = 24 }: MinusProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
};

export default Minus;
