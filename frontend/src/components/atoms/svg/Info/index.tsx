interface InfoProps {
  color?: string;
  size?: number;
}

const Info = ({ color = "currentColor", size = 24 }: InfoProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 8v.4" />
    </>
    </svg>
  );
};

export default Info;
