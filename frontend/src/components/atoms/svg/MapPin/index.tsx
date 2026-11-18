interface MapPinProps {
  color?: string;
  size?: number;
}

const MapPin = ({ color = "currentColor", size = 24 }: MapPinProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
    </svg>
  );
};

export default MapPin;
