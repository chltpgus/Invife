interface ChevronsUpDownProps {
  color?: string;
  size?: number;
}

const ChevronsUpDown = ({ color = "currentColor", size = 24 }: ChevronsUpDownProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
    </svg>
  );
};

export default ChevronsUpDown;
