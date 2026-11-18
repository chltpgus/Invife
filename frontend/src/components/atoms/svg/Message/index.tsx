interface MessageProps {
  color?: string;
  size?: number;
}

const Message = ({ color = "currentColor", size = 24 }: MessageProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 15.5a1.5 1.5 0 0 1-1.5 1.5H8l-4 3.5V5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5z" />
    </svg>
  );
};

export default Message;
