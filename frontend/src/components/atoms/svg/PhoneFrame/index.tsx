interface PhoneFrameProps {
  color?: string;
  size?: number;
}

const PhoneFrame = ({ color = "currentColor", size = 24 }: PhoneFrameProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </>
    </svg>
  );
};

export default PhoneFrame;
