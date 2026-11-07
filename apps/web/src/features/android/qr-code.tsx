import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** Crisp, dependency-light QR code rendered as an SVG path (no innerHTML). */
export function QrCode({
  value,
  size = 136,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
    return { path: d, count: n };
  }, [value]);
  const quiet = 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`}
      shapeRendering="crispEdges"
      className="rounded-input border bg-white"
    >
      <path d={path} fill="#0C0A08" />
    </svg>
  );
}
