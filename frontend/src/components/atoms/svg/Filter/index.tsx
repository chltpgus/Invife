interface FilterProps {
  color?: string;
  size?: number;
}

const Filter = ({ color = "currentColor", size = 24 }: FilterProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16l-6 7.2V19l-4 1.5v-8.3L4 5z" />
    </svg>
  );
};

export default Filter;
