interface MoreVerticalProps {
  color?: string;
  size?: number;
}

const MoreVertical = ({ color = "currentColor", size = 24 }: MoreVerticalProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6.5v.01M12 12v.01M12 17.5v.01" />
    </svg>
  );
};

export default MoreVertical;
