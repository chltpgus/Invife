interface ChevronLeftProps {
  color?: string;
  size?: number;
}

const ChevronLeft = ({ color = "currentColor", size = 24 }: ChevronLeftProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
};

export default ChevronLeft;
