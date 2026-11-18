import Link from 'next/link';
import ArrowLeft from '@/components/atoms/svg/ArrowLeft';

interface HostBarProps {
  title?: string;
  backHref?: string;
  backLabel?: string;
}

const HostBar = ({ title = '', backHref = '/', backLabel = '뒤로' }: HostBarProps) => {
  return (
    <header className="ed-top">
      <Link className="ed-icon-btn" href={backHref} aria-label={backLabel}>
        <ArrowLeft />
      </Link>
      <h1>{title}</h1>
    </header>
  );
};

export default HostBar;
