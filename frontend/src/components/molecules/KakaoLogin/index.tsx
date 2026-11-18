'use client';

interface KakaoLoginProps {
  label?: string;
  pending?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const KakaoLogin = ({ label = '카카오 로그인', pending = false, disabled = false, onClick = () => undefined }: KakaoLoginProps) => {
  return (
    <button type="button" className="ed-kakao" disabled={disabled || pending} aria-disabled={disabled || pending} onClick={onClick}>
      {pending ? '카카오로 이동 중…' : label}
    </button>
  );
};

export default KakaoLogin;
