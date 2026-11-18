interface CloseProps {
  color?: string;
  size?: number;
}

const Close = ({ color = "currentColor", size = 24 }: CloseProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
};

export default Close;
