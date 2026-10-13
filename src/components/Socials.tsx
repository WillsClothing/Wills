export const SOCIALS = [
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/wills.clothing_',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/share/152yM4wCYpH/?mibextid=wwXIfr',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" />
      </svg>
    ),
  },
];

/** Instagram and Facebook links as round gold icons. */
export default function Socials() {
  return (
    <div className="socials">
      {SOCIALS.map((s) => (
        <a key={s.name} href={s.href} target="_blank" rel="noreferrer" aria-label={`Wills Clothing on ${s.name}`} title={s.name}>
          {s.icon}
        </a>
      ))}
    </div>
  );
}
