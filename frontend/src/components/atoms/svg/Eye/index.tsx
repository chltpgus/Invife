interface EyeProps {
  color?: string;
  size?: number;
}

const Eye = ({ color = "currentColor", size = 24 }: EyeProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.2" />
    </>
    </svg>
  );
};

export default Eye;
