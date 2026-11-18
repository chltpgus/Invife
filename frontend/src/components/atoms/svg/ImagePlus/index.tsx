interface ImagePlusProps {
  color?: string;
  size?: number;
}

const ImagePlus = ({ color = "currentColor", size = 24 }: ImagePlusProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <rect x="3.5" y="4.5" width="13" height="13" rx="1" />
      <path d="M3.5 14.5l3.5-3.5 2.5 2.5M18.5 15.5v6M15.5 18.5h6" />
    </>
    </svg>
  );
};

export default ImagePlus;
