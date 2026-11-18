interface SearchProps {
  color?: string;
  size?: number;
}

const Search = ({ color = "currentColor", size = 24 }: SearchProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
    </>
    </svg>
  );
};

export default Search;
