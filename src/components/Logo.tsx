/** The Wills wordmark (white and gold, transparent background), for black surfaces. */
export default function Logo({ className }: { className?: string }) {
  return <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Wills" className={className} />;
}
