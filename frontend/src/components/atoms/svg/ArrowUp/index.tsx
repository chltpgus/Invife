interface ArrowUpProps {
  color?: string;
  size?: number;
}

const ArrowUp = ({ color = "currentColor", size = 24 }: ArrowUpProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
};

export default ArrowUp;
