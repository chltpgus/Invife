interface RefreshProps {
  color?: string;
  size?: number;
}

const Refresh = ({ color = "currentColor", size = 24 }: RefreshProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
    </svg>
  );
};

export default Refresh;
