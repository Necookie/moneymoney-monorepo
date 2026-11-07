'use client';

import { formatDate, formatMoney, formatMoneyCompact } from '@mm/finance-engine';
import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { niceDomain, valueExtent, type CashFlowRow } from '@/lib/cash-flow';
import { cn } from '@/lib/utils';

const INK = 'var(--mm-ink)';
const PROJECTION = 'var(--mm-projection)';
const MUTED = 'var(--mm-muted)';
const ACCENT_STRONG = '#A6B00A'; // darker chartreuse for a visible "Today" rule on white
const WARNING = 'var(--mm-warning)';

/**
 * Cash-flow chart: actual history (solid ink area) vs projection (dashed muted line with a soft
 * conservative↔optimistic band), a "Today" marker and the safety-buffer reference line.
 */
export function CashFlowChart({
  rows,
  today,
  safetyBuffer,
  height = 300,
  className,
}: {
  rows: CashFlowRow[];
  today: string;
  safetyBuffer: number;
  height?: number;
  className?: string;
}) {
  const domain = useMemo(
    () => niceDomain(valueExtent(rows, safetyBuffer > 0 ? [safetyBuffer] : [])),
    [rows, safetyBuffer],
  );

  const hasBand = rows.some((r) => r.band);

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <LegendSwatch kind="actual" label="Actual" />
        <LegendSwatch kind="projected" label="Projected" />
        {hasBand ? <LegendSwatch kind="band" label="Conservative–optimistic range" /> : null}
        {safetyBuffer > 0 ? <LegendSwatch kind="buffer" label="Safety buffer" /> : null}
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 16, right: 20, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="mm-actual-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0C0A08" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#0C0A08" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--mm-border)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: 'var(--mm-border)' }}
              tick={{ fill: MUTED, fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={28}
              tickFormatter={(d: string) => formatDate(d, false)}
            />
            <YAxis
              domain={domain}
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: MUTED, fontSize: 11 }}
              tickFormatter={(v: number) => formatMoneyCompact(Math.round(v))}
            />
            {hasBand ? (
              <Area
                dataKey="band"
                stroke="none"
                fill="var(--mm-projection-soft)"
                isAnimationActive={false}
                connectNulls={false}
                activeDot={false}
              />
            ) : null}
            <Area
              dataKey="actual"
              stroke={INK}
              strokeWidth={2}
              fill="url(#mm-actual-fill)"
              isAnimationActive={false}
              connectNulls={false}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--mm-card)', strokeWidth: 2, fill: INK }}
            />
            <Line
              dataKey="projected"
              stroke={PROJECTION}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
              activeDot={{ r: 4, stroke: 'var(--mm-card)', strokeWidth: 2, fill: PROJECTION }}
            />
            {safetyBuffer > 0 ? (
              <ReferenceLine
                y={safetyBuffer}
                stroke={WARNING}
                strokeDasharray="2 3"
                strokeOpacity={0.8}
                ifOverflow="extendDomain"
              />
            ) : null}
            <ReferenceLine y={0} stroke="var(--mm-border-strong)" ifOverflow="hidden" />
            <ReferenceLine
              x={today}
              stroke={ACCENT_STRONG}
              strokeWidth={2}
              label={{
                value: 'Today',
                position: 'insideTopLeft',
                fill: 'var(--mm-ink)',
                fontSize: 11,
                fontWeight: 600,
                offset: 6,
              }}
            />
            <Tooltip
              cursor={{ stroke: 'var(--mm-border-strong)', strokeWidth: 1 }}
              content={(props) => (
                <CashFlowTooltip active={props.active} payload={props.payload} today={today} />
              )}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendSwatch({
  kind,
  label,
}: {
  kind: 'actual' | 'projected' | 'band' | 'buffer';
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {kind === 'actual' ? <span className="h-0.5 w-4 rounded-full bg-ink" /> : null}
      {kind === 'projected' ? (
        <span className="h-0 w-4 border-t-2 border-dashed border-projection" />
      ) : null}
      {kind === 'band' ? <span className="h-2.5 w-4 rounded-sm bg-projection-soft" /> : null}
      {kind === 'buffer' ? (
        <span className="h-0 w-4 border-t-2 border-dotted border-warning" />
      ) : null}
      {label}
    </span>
  );
}

function CashFlowTooltip({
  active,
  payload,
  today,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  today: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashFlowRow | undefined;
  if (!row) return null;
  const isFuture = row.date > today;
  return (
    <div className="max-w-[300px] min-w-[220px] rounded-[10px] border bg-card p-3 text-[12px] shadow-popover">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-ink">{formatDate(row.date)}</span>
        {row.date === today ? (
          <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">
            Today
          </span>
        ) : isFuture ? (
          <span className="text-muted">Projected</span>
        ) : (
          <span className="text-muted">Actual</span>
        )}
      </div>
      <dl className="mt-2 space-y-1">
        {row.actual !== null ? (
          <Row label="Actual balance" value={formatMoney(row.actual)} strong />
        ) : null}
        {row.projected !== null ? (
          <Row
            label="Projected balance"
            value={formatMoney(row.projected)}
            strong={row.actual === null}
          />
        ) : null}
        {row.band ? (
          <Row
            label="Range"
            value={`${formatMoneyCompact(row.band[0])} – ${formatMoneyCompact(row.band[1])}`}
          />
        ) : null}
        {row.budgetedSpending > 0 ? (
          <Row
            label="Budgeted spending"
            value={`−${formatMoney(Math.abs(row.budgetedSpending))}`}
          />
        ) : null}
      </dl>
      {row.items.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t pt-2">
          {row.items.slice(0, 6).map((item, i) => (
            <li key={`${item.eventId}-${i}`} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-ink-soft">
                {item.name}
                {item.installment ? ` (${item.installment.index}/${item.installment.count})` : ''}
                {item.confidence !== 'confirmed' ? (
                  <span className="ml-1 text-muted">· {item.confidence}</span>
                ) : null}
              </span>
              <span
                className={cn(
                  'tabular shrink-0',
                  item.direction === 'inflow' ? 'text-positive' : 'text-ink',
                )}
              >
                {item.direction === 'inflow' ? '+' : '−'}
                {formatMoney(Math.abs(item.amount))}
              </span>
            </li>
          ))}
          {row.items.length > 6 ? (
            <li className="text-muted">+{row.items.length - 6} more</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('tabular', strong ? 'font-semibold text-ink' : 'text-ink-soft')}>
        {value}
      </dd>
    </div>
  );
}
