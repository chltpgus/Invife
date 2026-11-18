interface CloudOffProps {
  color?: string;
  size?: number;
}

const CloudOff = ({ color = "currentColor", size = 24 }: CloudOffProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <path d="M7 18h9a4 4 0 0 0 .4-8 5.4 5.4 0 0 0-2.2-1.2M4.5 16.2A3.5 3.5 0 0 1 6.2 10" />
      <path d="M4 4l16 16" />
    </>
    </svg>
  );
};

export default CloudOff;
