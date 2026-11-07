import { formatDate, formatMoneyCompact, toDayNumber } from '@mm/finance-engine';
import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, fonts } from '@/lib/theme';
import { Text } from './ui';

export interface BalancePoint {
  date: string;
  balance: number;
}

export interface CashFlowChartProps {
  /** Actual balances up to today (solid). */
  actual: BalancePoint[];
  /** Projected balances from today forward (dashed, never mixed with actual). */
  projected: BalancePoint[];
  today: string;
  /** Optional horizontal reference (safety buffer). */
  buffer?: number;
  height?: number;
}

const PAD = { top: 16, right: 8, bottom: 22, left: 48 };

/**
 * Balance over time. Honesty rules: actual = solid ink line + light area; projection = dashed
 * muted line over a soft band; "Today" marked in chartreuse; both series labelled.
 */
export function CashFlowChart({
  actual,
  projected,
  today,
  buffer,
  height = 190,
}: CashFlowChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const geo = useMemo(() => {
    const all = [...actual, ...projected];
    if (all.length < 2 || width === 0) return null;
    const xs = all.map((p) => toDayNumber(p.date));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs, minX + 1);
    const values = all.map((p) => p.balance);
    if (buffer !== undefined && buffer > 0) values.push(buffer);
    let minY = Math.min(...values, 0);
    let maxY = Math.max(...values);
    if (maxY === minY) maxY = minY + 100_00;
    const span = maxY - minY;
    minY -= span * 0.06;
    maxY += span * 0.08;
    const w = width - PAD.left - PAD.right;
    const h = height - PAD.top - PAD.bottom;
    const x = (date: string) => PAD.left + ((toDayNumber(date) - minX) / (maxX - minX)) * w;
    const y = (v: number) => PAD.top + (1 - (v - minY) / (maxY - minY)) * h;
    const line = (pts: BalancePoint[]) =>
      pts
        .map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.balance).toFixed(1)}`)
        .join('');
    const area = (pts: BalancePoint[]) =>
      pts.length < 2
        ? ''
        : `${line(pts)}L${x(pts[pts.length - 1]!.date).toFixed(1)},${(PAD.top + h).toFixed(1)}L${x(pts[0]!.date).toFixed(1)},${(PAD.top + h).toFixed(1)}Z`;
    const ticks = [maxY - (maxY - minY) * 0.08, (maxY + minY) / 2, minY + (maxY - minY) * 0.06].map(
      (v) => Math.round(v),
    );
    const todayX = toDayNumber(today) >= minX && toDayNumber(today) <= maxX ? x(today) : null;
    return {
      actualLine: line(actual),
      actualArea: area(actual),
      projectedLine: line(projected),
      projectedArea: area(projected),
      ticks: ticks.map((v) => ({ v, y: y(v) })),
      zeroY: minY < 0 && maxY > 0 ? y(0) : null,
      bufferY: buffer && buffer > 0 ? y(buffer) : null,
      todayX,
      w,
      h,
      firstDate: all.reduce((a, p) => (p.date < a ? p.date : a), all[0]!.date),
      lastDate: all.reduce((a, p) => (p.date > a ? p.date : a), all[0]!.date),
    };
  }, [actual, projected, width, height, today, buffer]);

  return (
    <View onLayout={onLayout} style={{ height: height + 28 }}>
      {geo ? (
        <Svg width={width} height={height}>
          <G>
            {geo.ticks.map((t) => (
              <G key={t.v}>
                <Line
                  x1={PAD.left}
                  x2={PAD.left + geo.w}
                  y1={t.y}
                  y2={t.y}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={PAD.left - 6}
                  y={t.y + 4}
                  fontSize={10}
                  fontFamily={fonts.regular}
                  fill={colors.muted}
                  textAnchor="end"
                >
                  {formatMoneyCompact(t.v)}
                </SvgText>
              </G>
            ))}
            {geo.zeroY !== null ? (
              <Line
                x1={PAD.left}
                x2={PAD.left + geo.w}
                y1={geo.zeroY}
                y2={geo.zeroY}
                stroke={colors.negative}
                strokeOpacity={0.4}
                strokeWidth={1}
              />
            ) : null}
            {geo.bufferY !== null ? (
              <Line
                x1={PAD.left}
                x2={PAD.left + geo.w}
                y1={geo.bufferY}
                y2={geo.bufferY}
                stroke={colors.warning}
                strokeOpacity={0.6}
                strokeDasharray="2 4"
                strokeWidth={1}
              />
            ) : null}
            {geo.projectedArea ? <Path d={geo.projectedArea} fill={colors.projectionSoft} /> : null}
            {geo.actualArea ? (
              <Path d={geo.actualArea} fill={colors.ink} fillOpacity={0.05} />
            ) : null}
            {geo.actualLine ? (
              <Path d={geo.actualLine} stroke={colors.ink} strokeWidth={2} fill="none" />
            ) : null}
            {geo.projectedLine ? (
              <Path
                d={geo.projectedLine}
                stroke={colors.projection}
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="none"
              />
            ) : null}
            {geo.todayX !== null ? (
              <G>
                <Line
                  x1={geo.todayX}
                  x2={geo.todayX}
                  y1={PAD.top}
                  y2={PAD.top + geo.h}
                  stroke={colors.ink}
                  strokeWidth={1}
                />
                <Rect
                  x={geo.todayX - 19}
                  y={0}
                  width={38}
                  height={15}
                  rx={3}
                  fill={colors.accent}
                />
                <SvgText
                  x={geo.todayX}
                  y={11}
                  fontSize={9.5}
                  fontFamily={fonts.semibold}
                  fill={colors.accentInk}
                  textAnchor="middle"
                >
                  Today
                </SvgText>
              </G>
            ) : null}
            <SvgText
              x={PAD.left}
              y={height - 6}
              fontSize={10}
              fontFamily={fonts.regular}
              fill={colors.muted}
            >
              {formatDate(geo.firstDate, false)}
            </SvgText>
            <SvgText
              x={PAD.left + geo.w}
              y={height - 6}
              fontSize={10}
              fontFamily={fonts.regular}
              fill={colors.muted}
              textAnchor="end"
            >
              {formatDate(geo.lastDate, false)}
            </SvgText>
          </G>
        </Svg>
      ) : (
        <View style={{ height }} className="items-center justify-center">
          <Text className="text-sm text-muted">{width ? 'Not enough data to chart yet' : ' '}</Text>
        </View>
      )}
      <View className="flex-row items-center gap-4 pl-12">
        <LegendSwatch label="Actual" dashed={false} />
        <LegendSwatch label="Projected" dashed />
      </View>
    </View>
  );
}

function LegendSwatch({ label, dashed }: { label: string; dashed: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Svg width={18} height={4}>
        <Line
          x1={0}
          x2={18}
          y1={2}
          y2={2}
          stroke={dashed ? colors.projection : colors.ink}
          strokeWidth={2}
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </Svg>
      <Text className="text-xs text-muted">{label}</Text>
    </View>
  );
}
