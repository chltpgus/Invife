interface ImageOffProps {
  color?: string;
  size?: number;
}

const ImageOff = ({ color = "currentColor", size = 24 }: ImageOffProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
      <path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5M4 4l16 16" />
    </>
    </svg>
  );
};

export default ImageOff;
