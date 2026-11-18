interface ChevronDownProps {
  color?: string;
  size?: number;
}

const ChevronDown = ({ color = "currentColor", size = 24 }: ChevronDownProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
};

export default ChevronDown;
