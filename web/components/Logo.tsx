export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#12202f" />
        <path d="M8 9 C 16 9, 12 16, 16 16 S 16 23, 24 23" fill="none" stroke="#7fc8b5" strokeWidth="3" strokeLinecap="round" />
        <circle cx="8" cy="9" r="3.2" fill="#ffffff" />
        <circle cx="16" cy="16" r="3.2" fill="#e0a030" />
        <circle cx="24" cy="23" r="3.2" fill="#2fb391" />
      </svg>
      <span className="logo-name">Clearfund</span>
    </span>
  );
}
