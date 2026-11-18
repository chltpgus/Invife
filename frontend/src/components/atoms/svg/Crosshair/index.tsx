interface CrosshairProps {
  color?: string;
  size?: number;
}

const Crosshair = ({ color = "currentColor", size = 24 }: CrosshairProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
    </svg>
  );
};

export default Crosshair;
