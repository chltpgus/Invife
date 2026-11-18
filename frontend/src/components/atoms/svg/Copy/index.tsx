interface CopyProps {
  color?: string;
  size?: number;
}

const Copy = ({ color = "currentColor", size = 24 }: CopyProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <rect x="9" y="9" width="11" height="11" rx="1" />
      <path d="M5 15H4.5A.5.5 0 0 1 4 14.5v-10a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5V5" />
    </>
    </svg>
  );
};

export default Copy;
