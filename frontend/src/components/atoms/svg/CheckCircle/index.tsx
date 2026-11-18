interface CheckCircleProps {
  color?: string;
  size?: number;
}

const CheckCircle = ({ color = "currentColor", size = 24 }: CheckCircleProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.2l2.6 2.6L16.2 9" />
    </>
    </svg>
  );
};

export default CheckCircle;
