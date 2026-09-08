import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BarGraph, Doughnut } from './insight-charts';
import { useInsightTransactions } from '../hooks/use-insight-transactions';
import { amountOf, categoryTotals, localMonth, money, monthTitle, occurrences, shiftMonth, sumOccurrences, transactionsForMonth, trendBuckets, validMonth, type ExpenseMode, type Granularity, type Occurrence } from '../services/analytics';

type Section = 'Overview' | 'Trends' | 'Categories';
function Choices<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (value: T) => void }) {
  return <View style={s.choices}>{options.map(option => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: value === option }} onPress={() => onChange(option)} style={[s.choice, value === option && s.activeChoice]}><Text style={[s.choiceText, value === option && s.activeText]}>{option}</Text></Pressable>)}</View>;
}

export default function InsightsScreen() {
  const params = useLocalSearchParams<{ month?: string }>();
  const router = useRouter();
  const month = validMonth(params.month) ? params.month : localMonth();
  const setMonth = (nextMonth: string) => router.setParams({ month: nextMonth });
  const [section, setSection] = useState<Section>('Overview');
  const [mode, setMode] = useState<ExpenseMode>('all');
  const [granularity, setGranularity] = useState<Granularity>('Daily');
  const [detail, setDetail] = useState<{ title: string; rows: Occurrence[] } | null>(null);
  const { items, loading, error, retry } = useInsightTransactions();
  const detailRows = useMemo(() => {
    if (!detail) return [];
    const selectedKeys = new Set(detail.rows.map(row => row.key));
    return [...new Set(detail.rows.map(row => row.month))]
      .flatMap(selectedMonth => occurrences(items, selectedMonth, mode))
      .filter(row => selectedKeys.has(row.key));
  }, [detail, items, mode]);
  const rows = useMemo(() => occurrences(items, month, mode), [items, month, mode]);
  const total = sumOccurrences(rows);
  const categories = useMemo(() => categoryTotals(rows), [rows]);
  const income = transactionsForMonth(items, month).filter(item => item.type === 'income').reduce((sum, item) => sum + amountOf(item), 0);
  const allExpenses = sumOccurrences(occurrences(items, month));
  const buckets = useMemo(() => trendBuckets(items, month, mode, granularity), [items, month, mode, granularity]);
  const trendTotal = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const highest = buckets.reduce((best, bucket) => bucket.value > best.value ? bucket : best, buckets[0]);
  const missingDates = rows.filter(row => row.day === null);
  const topCategories = categories.slice(0, 4);
  const rest = categories.slice(4);
  const doughnutData = rest.length ? [...topCategories, { key: 'remaining', label: 'Remaining categories', color: '#94A3B8', value: rest.reduce((sum, group) => sum + group.value, 0), rows: rest.flatMap(group => group.rows) }] : topCategories;
  const periodTitle = section !== 'Trends' || granularity === 'Daily' || granularity === 'Weekly' ? monthTitle(month) : granularity === 'Monthly' ? month.slice(0, 4) : `${Number(month.slice(0, 4)) - 4}–${month.slice(0, 4)}`;
  const step = section === 'Trends' && granularity === 'Yearly' ? 60 : section === 'Trends' && granularity === 'Monthly' ? 12 : 1;
  const movePeriod = (offset: number) => { const next = shiftMonth(month, offset); if (validMonth(next) && Number(next.slice(0, 4)) >= 1904) setMonth(next); };
  const showCategory = (group: typeof categories[number]) => setDetail({ title: `${group.label} · ${monthTitle(month)}`, rows: group.rows });

  return <SafeAreaView edges={['top', 'left', 'right']} style={s.safe}>
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}><View><Text style={s.eyebrow}>FINANCEPRO</Text><Text style={s.title}>Insights</Text></View><View style={s.headerIcon}><MaterialIcons name="insights" size={27} color="#2563EB" /></View></View>
      <Text style={s.subtitle}>Understand where your money goes.</Text>
      <Choices options={['Overview', 'Trends', 'Categories']} value={section} onChange={setSection} />
      <View style={s.period}><Pressable accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => movePeriod(-step)} style={s.arrow}><MaterialIcons name="chevron-left" size={26} color="#334155" /></Pressable><Text style={s.periodText}>{periodTitle}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next period" onPress={() => movePeriod(step)} style={s.arrow}><MaterialIcons name="chevron-right" size={26} color="#334155" /></Pressable></View>
      <Pressable accessibilityRole="button" onPress={() => setMonth(localMonth())}><Text style={s.reset}>Back to current month</Text></Pressable>
      <Choices options={['All expenses', 'Marked paid']} value={mode === 'all' ? 'All expenses' : 'Marked paid'} onChange={value => setMode(value === 'All expenses' ? 'all' : 'paid')} />
      <Text style={s.note}>{mode === 'all' ? 'Includes scheduled and unpaid expenses.' : 'Only expenses marked paid for each month.'} Dates reflect entries or due dates, not the day payment was made.</Text>
      {loading ? <View style={s.card}><ActivityIndicator color="#2563EB" /><Text style={s.empty}>Loading your insights…</Text></View> : error ? <View style={s.card}><Text style={s.empty}>{error}</Text><Pressable onPress={retry} accessibilityRole="button"><Text style={s.reset}>Try again</Text></Pressable></View> : <>
        {section === 'Overview' && <>
          <View style={s.summary}><View style={s.metric}><Text style={s.small}>Income</Text><Text style={[s.metricValue, { color: '#15803D' }]}>{money(income)}</Text></View><View style={s.metric}><Text style={s.small}>{mode === 'paid' ? 'Marked paid' : 'Expenses'}</Text><Text style={s.metricValue}>{money(total)}</Text></View></View>
          <Text style={s.balance}>Balance after all scheduled expenses: {money(income - allExpenses)}</Text>
          <View style={s.card}><Text style={s.cardTitle}>Spending by category</Text><Text style={s.small}>Share of {mode === 'paid' ? 'paid' : 'all'} expenses this month</Text>
            {total > 0 ? <><Doughnut data={doughnutData} total={total} />{doughnutData.map(group => <Pressable accessibilityRole="button" accessibilityLabel={`${group.label}, ${money(group.value)}, ${Math.round(group.value / total * 100)} percent. View transactions`} key={group.key} onPress={() => showCategory(group)} style={s.legend}><View style={[s.dot, { backgroundColor: group.color }]} /><Text style={s.legendName}>{group.label}</Text><Text style={s.legendValue}>{Math.round(group.value / total * 100)}% · {money(group.value)}</Text></Pressable>)}<View style={s.insight}><Text style={s.insightText}>{categories[0].label} is your largest category at {Math.round(categories[0].value / total * 100)}% of expenses.</Text></View></> : <Text style={s.empty}>No {mode === 'paid' ? 'paid ' : ''}expenses this month. Add entries on Home to see your breakdown.</Text>}
          </View>
          <View style={s.card}><Text style={s.cardTitle}>Income vs expenses</Text><Text style={s.small}>Monthly income compared with {mode === 'paid' ? 'marked-paid' : 'all scheduled'} expenses</Text><BarGraph data={[{ key: 'income', label: 'Income', value: income, rows: [] }, { key: 'expense', label: 'Expenses', value: total, rows }]} /></View>
        </>}
        {section === 'Trends' && <>
          <View style={s.card}><Text style={s.cardTitle}>Spending over time</Text><Choices options={['Daily', 'Weekly', 'Monthly', 'Yearly']} value={granularity} onChange={setGranularity} />
            <Text style={s.small}>{granularity === 'Weekly' ? 'Day ranges within the selected month' : granularity === 'Daily' ? 'Day of month · entry / due date' : granularity === 'Monthly' ? 'Monthly expenses for the selected year' : 'Annual expenses across five years'}</Text>
            <BarGraph data={buckets} onSelect={bucket => setDetail({ title: `${periodTitle} · ${granularity === 'Daily' ? 'Day ' : granularity === 'Weekly' ? 'Days ' : ''}${bucket.label}`, rows: bucket.rows })} />
            <Text style={s.note}>Tap a bar to see its entries.{granularity === 'Monthly' || granularity === 'Yearly' ? ' Future scheduled entries are included in All expenses.' : ''}</Text>
            {trendTotal === 0 && <Text style={s.empty}>No expenses in this period.</Text>}
            {(granularity === 'Daily' || granularity === 'Weekly') && missingDates.length > 0 && <Pressable onPress={() => setDetail({ title: 'Entries without a valid day', rows: missingDates })}><Text style={s.warning}>{money(sumOccurrences(missingDates))} without a valid day is excluded from this chart. Tap to review.</Text></Pressable>}
          </View>
          <View style={s.card}><Text style={s.small}>PERIOD TOTAL</Text><Text style={s.bigValue}>{money(trendTotal)}</Text><View style={s.divider} /><Text style={s.small}>Average per {granularity === 'Daily' ? 'day' : granularity === 'Weekly' ? 'week group' : granularity === 'Monthly' ? 'month' : 'year'} (including zero periods)</Text><Text style={s.metricValue}>{money(trendTotal / buckets.length)}</Text>{highest.value > 0 && <View style={s.insight}><Text style={s.insightText}>Highest: {granularity === 'Daily' ? 'day ' : granularity === 'Weekly' ? 'days ' : ''}{highest.label} · {money(highest.value)}</Text></View>}</View>
        </>}
        {section === 'Categories' && <View style={s.card}><Text style={s.cardTitle}>Your biggest categories</Text><Text style={s.small}>Highest first · tap a category to explore its entries</Text>{categories.length === 0 ? <Text style={s.empty}>No expenses to compare in this month.</Text> : categories.map(group => <Pressable accessibilityRole="button" accessibilityLabel={`${group.label}, ${money(group.value)}. View transactions`} key={group.key} onPress={() => showCategory(group)} style={s.category}><View style={s.legend}><View style={[s.dot, { backgroundColor: group.color }]} /><Text style={s.legendName}>{group.label}</Text><Text style={s.legendValue}>{money(group.value)}</Text></View><View style={s.track}><View style={[s.fill, { width: `${group.value / categories[0].value * 100}%`, backgroundColor: group.color }]} /></View><Text style={s.small}>{Math.round(group.value / total * 100)}% of expenses · {group.rows.length} {group.rows.length === 1 ? 'entry' : 'entries'}</Text></Pressable>)}</View>}
      </>}
    </ScrollView>
    <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
      <SafeAreaView style={s.safe}><View style={s.detailHeader}><Text style={s.detailTitle}>{detail?.title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close transaction details" onPress={() => setDetail(null)} style={s.arrow}><MaterialIcons name="close" size={26} color="#334155" /></Pressable></View><ScrollView contentContainerStyle={s.page}><Text style={s.bigValue}>{money(sumOccurrences(detailRows))}</Text><Text style={s.note}>Entry / due dates shown. Manage transactions and payment status on Home.</Text>{detailRows.length === 0 && <Text style={s.empty}>No expenses in this period.</Text>}{detailRows.map(row => <View key={row.key} style={s.transaction}><View style={{ flex: 1 }}><Text style={s.cardTitle}>{row.item.detail || 'Untitled entry'}</Text><Text style={s.small}>{row.day ? `${row.day} · ` : 'No day · '}{monthTitle(row.month)} · {row.paid ? 'Marked paid' : 'Unpaid / scheduled'}</Text></View><Text style={s.legendValue}>{money(row.amount)}</Text></View>)}</ScrollView></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' }, page: { padding: 20, paddingBottom: 36, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { color: '#64748B', fontSize: 10, fontWeight: '700', letterSpacing: 2 }, title: { color: '#0F172A', fontSize: 32, fontWeight: '800', marginTop: 4 },
  headerIcon: { backgroundColor: '#DBEAFE', borderRadius: 16, padding: 12 }, subtitle: { color: '#64748B', fontSize: 14, marginTop: 6, marginBottom: 20 },
  choices: { flexDirection: 'row', backgroundColor: '#E9EFF6', borderRadius: 12, padding: 4, marginVertical: 8 }, choice: { flex: 1, minHeight: 40, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, activeChoice: { backgroundColor: '#FFFFFF' }, choiceText: { color: '#64748B', fontSize: 12, fontWeight: '600' }, activeText: { color: '#2563EB' },
  period: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, arrow: { padding: 10, minWidth: 44, minHeight: 44 }, periodText: { color: '#0F172A', fontSize: 17, fontWeight: '700' }, reset: { textAlign: 'center', color: '#2563EB', fontSize: 12, padding: 10 },
  note: { color: '#64748B', fontSize: 11, lineHeight: 17, marginVertical: 10 }, small: { color: '#64748B', fontSize: 12, lineHeight: 19 },
  summary: { flexDirection: 'row', gap: 12, marginTop: 8 }, metric: { flex: 1, backgroundColor: '#FFFFFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' }, metricValue: { color: '#0F172A', fontSize: 19, fontWeight: '700', marginTop: 5 }, balance: { color: '#475569', fontSize: 12, marginTop: 10, marginBottom: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 16 }, cardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '700', marginBottom: 5 }, empty: { color: '#64748B', textAlign: 'center', lineHeight: 22, paddingVertical: 26 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, flexWrap: 'wrap' }, dot: { width: 9, height: 9, borderRadius: 5 }, legendName: { color: '#334155', fontSize: 13, flex: 1 }, legendValue: { color: '#334155', fontSize: 12, fontWeight: '600' },
  insight: { backgroundColor: '#EFF6FF', padding: 12, borderRadius: 10, marginTop: 14 }, insightText: { color: '#1D4ED8', fontSize: 12, lineHeight: 19 }, bigValue: { color: '#0F172A', fontSize: 28, fontWeight: '700', marginTop: 6 }, divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 16 }, warning: { color: '#92400E', backgroundColor: '#FFFBEB', padding: 12, borderRadius: 8, lineHeight: 19, fontSize: 12 },
  category: { marginTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }, track: { height: 9, borderRadius: 5, backgroundColor: '#F1F5F9', marginBottom: 8, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 5 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }, detailTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0F172A' }, transaction: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
});
