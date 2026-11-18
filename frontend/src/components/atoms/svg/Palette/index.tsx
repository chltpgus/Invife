interface PaletteProps {
  color?: string;
  size?: number;
}

const Palette = ({ color = "currentColor", size = 24 }: PaletteProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-1 1.4-2.1-.3-.8.2-1.4 1-1.4H16a3 3 0 0 0 3-3.2A8.5 8.5 0 0 0 12 3.5z" />
      <path d="M8 10.2h.01M10.2 7.6h.01M14 7.6h.01M16 10.5h.01" />
    </>
    </svg>
  );
};

export default Palette;
