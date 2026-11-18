interface TrashProps {
  color?: string;
  size?: number;
}

const Trash = ({ color = "currentColor", size = 24 }: TrashProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <path d="M5 7h14M9 7V5h6v2M8 7l.7 12h6.6L16 7" />
    </>
    </svg>
  );
};

export default Trash;
