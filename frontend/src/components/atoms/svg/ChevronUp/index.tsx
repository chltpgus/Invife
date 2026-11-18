interface ChevronUpProps {
  color?: string;
  size?: number;
}

const ChevronUp = ({ color = "currentColor", size = 24 }: ChevronUpProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
};

export default ChevronUp;
