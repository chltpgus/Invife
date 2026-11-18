interface CloudCheckProps {
  color?: string;
  size?: number;
}

const CloudCheck = ({ color = "currentColor", size = 24 }: CloudCheckProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <path d="M7 18h9a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.5 1.5A3.5 3.5 0 0 0 7 18z" />
      <path d="M8.5 14.5l2 2 4-4" />
    </>
    </svg>
  );
};

export default CloudCheck;
