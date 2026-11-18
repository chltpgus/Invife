interface ArrowLeftProps {
  color?: string;
  size?: number;
}

const ArrowLeft = ({ color = "currentColor", size = 24 }: ArrowLeftProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
};

export default ArrowLeft;
