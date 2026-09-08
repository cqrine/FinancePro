import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { money, type Bucket } from '../services/analytics';

export function BarGraph({ data, onSelect, compact = false }: { data: Bucket[]; onSelect?: (bucket: Bucket) => void; compact?: boolean }) {
  const max = Math.max(...data.map(item => item.value), 1);
  const barHeight = compact ? 48 : 140;
  return <View>
    {!compact && <Text style={styles.caption}>RM · scale 0–{max.toLocaleString('en-MY', { maximumFractionDigits: 0 })}{data.length > 7 ? ' · swipe for more' : ''}</Text>}
    <ScrollView horizontal showsHorizontalScrollIndicator={!compact} contentContainerStyle={{ flexGrow: 1, paddingVertical: 8 }}>
      {data.map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.label}, ${money(item.value)}. View transactions`} disabled={!onSelect} onPress={() => onSelect?.(item)} style={[styles.column, { minWidth: compact ? 30 : 48, flex: 1 }]}>
        {!compact && <Text numberOfLines={1} style={styles.value}>{item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : item.value.toFixed(0)}</Text>}
        <View style={{ height: barHeight, justifyContent: 'flex-end', alignItems: 'center' }}><View style={{ width: compact ? 16 : 24, height: item.value > 0 ? Math.max(2, item.value / max * barHeight) : 1, backgroundColor: item.value > 0 ? '#2563EB' : '#CBD5E1', borderTopLeftRadius: 5, borderTopRightRadius: 5 }} /></View>
        <Text style={styles.label}>{item.label}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}

export function Doughnut({ data, total }: { data: { key: string; value: number; color: string }[]; total: number }) {
  const radius = 74;
  // Explicit paths avoid SVG Text/origin translation issues on web.
  const segments = data.map((item, index) => {
    const preceding = data.slice(0, index).reduce((sum, segment) => sum + segment.value, 0);
    const start = -Math.PI / 2 + (total > 0 ? preceding / total * Math.PI * 2 : 0);
    const end = start + (total > 0 ? item.value / total * Math.PI * 2 : 0);
    const d = `M ${100 + radius * Math.cos(start)} ${100 + radius * Math.sin(start)} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${100 + radius * Math.cos(end)} ${100 + radius * Math.sin(end)}`;
    return item.value >= total && total > 0 ? <Circle key={item.key} cx={100} cy={100} r={radius} fill="none" stroke={item.color} strokeWidth={25} /> : <Path key={item.key} d={d} fill="none" stroke={item.color} strokeWidth={25} />;
  });
  return <View style={styles.doughnut} accessible accessibilityLabel={`Expense distribution, total ${money(total)}. Category amounts are listed below.`}>
    <Svg width={200} height={200} viewBox="0 0 200 200"><Circle cx={100} cy={100} r={radius} fill="none" stroke="#E2E8F0" strokeWidth={25} />{segments}</Svg>
    <View pointerEvents="none" style={styles.center}><Text style={styles.caption}>TOTAL EXPENSES</Text><Text adjustsFontSizeToFit numberOfLines={1} style={styles.total}>{money(total)}</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  caption: { color: '#64748B', fontSize: 11, lineHeight: 17 }, column: { paddingHorizontal: 4, alignItems: 'center', paddingVertical: 4 }, value: { fontSize: 10, color: '#475569', marginBottom: 6 }, label: { color: '#64748B', fontSize: 11, marginTop: 8 },
  doughnut: { alignSelf: 'center', width: 200, height: 200, marginVertical: 8 }, center: { position: 'absolute', top: 76, left: 35, right: 35, alignItems: 'center' }, total: { color: '#0F172A', fontSize: 19, fontWeight: '700', marginTop: 4 },
});
