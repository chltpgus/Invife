interface ChevronRightProps {
  color?: string;
  size?: number;
}

const ChevronRight = ({ color = "currentColor", size = 24 }: ChevronRightProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
};

export default ChevronRight;
