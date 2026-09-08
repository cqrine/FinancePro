import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BarGraph } from './insight-charts';
import { localMonth, money, occurrences, sumOccurrences, type AnalyticsTransaction } from '../services/analytics';

export function SpendingPreview({ items, month }: { items: AnalyticsTransaction[]; month: string }) {
  const router = useRouter();
  const now = new Date();
  const endDay = month === localMonth(now) ? now.getDate() : new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const startDay = Math.max(1, endDay - 6);
  const rows = occurrences(items, month);
  const data = Array.from({ length: endDay - startDay + 1 }, (_, i) => {
    const day = i + startDay;
    const entries = rows.filter(row => row.day === day);
    return { key: String(day), label: String(day), rows: entries, value: sumOccurrences(entries) };
  });
  return <Pressable accessibilityRole="button" accessibilityLabel="View spending insights" onPress={() => router.push({ pathname: '/explore', params: { month } })} style={styles.card}>
    <View style={styles.heading}><Text style={styles.title}>Spending snapshot</Text><Text style={styles.link}>Insights →</Text></View>
    <Text style={styles.total}>{money(data.reduce((sum, row) => sum + row.value, 0))}</Text>
    <Text style={styles.caption}>Days {startDay}–{endDay} · includes scheduled expenses</Text><BarGraph data={data} compact />
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0' }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { fontSize: 15, fontWeight: '700', color: '#0F172A' }, link: { color: '#2563EB', fontWeight: '600', fontSize: 13 }, total: { fontSize: 24, fontWeight: '700', color: '#0F172A', marginTop: 12 }, caption: { color: '#64748B', fontSize: 12, marginTop: 4 },
});
