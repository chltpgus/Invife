interface GripProps {
  color?: string;
  size?: number;
}

const Grip = ({ color = "currentColor", size = 24 }: GripProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <path d="M9 7h.01M9 12h.01M9 17h.01M15 7h.01M15 12h.01M15 17h.01" />
    </>
    </svg>
  );
};

export default Grip;
