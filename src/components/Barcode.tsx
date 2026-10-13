// EAN-13 barcode drawn as SVG, so labels print sharp at any size with no extra library.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function isEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = [...code.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/** The 95 black/white modules of an EAN-13 symbol. */
export function ean13Modules(code: string): string {
  const d = [...code].map(Number);
  const parity = PARITY[d[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + '101';
}

export default function Barcode({ code, height = 52, className = '' }: { code: string; height?: number; className?: string }) {
  if (!isEan13(code)) return <span className="small muted">{code || 'No barcode yet'}</span>;
  const bits = ean13Modules(code);
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  const quiet = 9;
  const textY = height + 9;
  return (
    <svg className={`barcode ${className}`} viewBox={`0 0 ${95 + quiet * 2} ${height + 11}`} role="img" aria-label={`Barcode ${code}`}>
      <rect width="100%" height="100%" fill="#fff" />
      {[...bits].map((b, i) =>
        b === '1' ? <rect key={i} x={quiet + i} y={0} width={1} height={guard.has(i) ? height + 5 : height} fill="#000" /> : null,
      )}
      <g fontFamily="monospace" fontSize="9" fill="#000" textAnchor="middle">
        <text x={quiet - 4} y={textY}>{code[0]}</text>
        <text x={quiet + 3 + 21} y={textY} textLength="38" lengthAdjust="spacing">{code.slice(1, 7)}</text>
        <text x={quiet + 50 + 21} y={textY} textLength="38" lengthAdjust="spacing">{code.slice(7)}</text>
      </g>
    </svg>
  );
}
