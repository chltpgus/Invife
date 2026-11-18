interface AlertProps {
  color?: string;
  size?: number;
}

const Alert = ({ color = "currentColor", size = 24 }: AlertProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.3" />
    </>
    </svg>
  );
};

export default Alert;
