import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme';

type LogEntry = {
  category: string | null;
  action: 'used' | 'wasted';
  created_at: string;
};

type MonthBar = { label: string; used: number; wasted: number };
type CategoryStat = { label: string; pct: number };

const ESTIMATED_VALUE_PER_ITEM = 2.5;

export default function AnalyticsScreen() {
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [months, setMonths] = useState<MonthBar[]>([]);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [savedThisMonth, setSavedThisMonth] = useState(0);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const { data, error } = await supabase
      .from('waste_log')
      .select('category, action, created_at')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      setHasData(false);
      setLoading(false);
      return;
    }
    setHasData(true);

    const entries = data as LogEntry[];

    const monthBuckets: Record<string, MonthBar> = {};
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString('en-US', { month: 'short' });
      monthKeys.push(key);
      monthBuckets[key] = { label: key, used: 0, wasted: 0 };
    }

    entries.forEach((e) => {
      const key = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short' });
      if (monthBuckets[key]) {
        if (e.action === 'used') monthBuckets[key].used += 1;
        else monthBuckets[key].wasted += 1;
      }
    });

    const rawMonths = monthKeys.map((k) => monthBuckets[k]);
    const maxCount = Math.max(1, ...rawMonths.map((m) => Math.max(m.used, m.wasted)));
    const scaledMonths = rawMonths.map((m) => ({
      label: m.label,
      used: Math.round((m.used / maxCount) * 100),
      wasted: Math.round((m.wasted / maxCount) * 100),
    }));

    const categoryTotals: Record<string, { used: number; wasted: number }> = {};
    entries.forEach((e) => {
      const cat = e.category || 'Other';
      if (!categoryTotals[cat]) categoryTotals[cat] = { used: 0, wasted: 0 };
      categoryTotals[cat][e.action] += 1;
    });

    const categoryStats: CategoryStat[] = Object.entries(categoryTotals)
      .map(([label, counts]) => {
        const total = counts.used + counts.wasted;
        return { label, pct: total > 0 ? Math.round((counts.wasted / total) * 100) : 0 };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);

    const now = new Date();
    const usedThisMonth = entries.filter((e) => {
      const d = new Date(e.created_at);
      return e.action === 'used' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    setMonths(scaledMonths);
    setCategories(categoryStats);
    setSavedThisMonth(usedThisMonth * ESTIMATED_VALUE_PER_ITEM);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAnalytics();
    }, [loadAnalytics])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Text style={styles.title}>Insights</Text>
        <Text style={styles.subtitle}>Your household's food habits</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : !hasData ? (
          <Text style={styles.emptyText}>
            No history yet — mark a few items ✅ used or 🗑️ wasted from the Home tab, then check back here.
          </Text>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.legendText}>Used</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: colors.red }]} />
                  <Text style={styles.legendText}>Wasted</Text>
                </View>
              </View>
              <View style={styles.bars}>
                {months.map((m) => (
                  <View key={m.label} style={styles.barGroup}>
                    <View style={[styles.bar, { height: Math.max(2, m.used), backgroundColor: colors.primary }]} />
                    <View style={[styles.bar, { height: Math.max(2, m.wasted), backgroundColor: colors.red, opacity: 0.75 }]} />
                  </View>
                ))}
              </View>
              <View style={styles.monthLabels}>
                {months.map((m) => (
                  <Text key={m.label} style={styles.monthLabel}>{m.label}</Text>
                ))}
              </View>
            </View>

            {categories.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Most-wasted categories</Text>
                <View style={[styles.card, { paddingTop: 14 }]}>
                  {categories.map((c) => (
                    <View key={c.label} style={styles.wasteRow}>
                      <Text style={styles.wasteLabel}>{c.label}</Text>
                      <View style={styles.wasteTrack}>
                        <View style={[styles.wasteFill, { width: `${c.pct}%` }]} />
                      </View>
                      <Text style={styles.wastePct}>{c.pct}%</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={styles.saveCard}>
              <Text style={styles.saveAmt}>${savedThisMonth.toFixed(2)}</Text>
              <Text style={styles.saveLab}>
                estimated savings this month from {Math.round(savedThisMonth / ESTIMATED_VALUE_PER_ITEM)} items used before they expired
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  emptyText: { textAlign: 'center', color: colors.inkSoft, fontSize: 12.5, marginTop: 40, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, padding: 16, marginTop: 8 },
  legendRow: { flexDirection: 'row', gap: 14, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10.5, fontWeight: '700', color: colors.inkSoft },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 10 },
  barGroup: { flex: 1, flexDirection: 'row', gap: 3, alignItems: 'flex-end', justifyContent: 'center' },
  bar: { width: 9, borderRadius: 4 },
  monthLabels: { flexDirection: 'row', gap: 10, marginTop: 8 },
  monthLabel: { flex: 1, textAlign: 'center', fontSize: 9.5, fontWeight: '700', color: colors.inkSoft },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 22, marginBottom: 4 },
  wasteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  wasteLabel: { width: 90, fontSize: 11, fontWeight: '700', color: colors.ink },
  wasteTrack: { flex: 1, height: 9, backgroundColor: colors.redSoft, borderRadius: 6, overflow: 'hidden' },
  wasteFill: { height: '100%', backgroundColor: colors.red, borderRadius: 6 },
  wastePct: { width: 32, fontSize: 10.5, fontWeight: '700', color: colors.inkSoft, textAlign: 'right' },
  saveCard: { marginTop: 18, backgroundColor: colors.primary, borderRadius: radius.xl, padding: 18 },
  saveAmt: { fontSize: 27, fontWeight: '700', color: colors.white },
  saveLab: { fontSize: 12, color: colors.white, opacity: 0.85, marginTop: 3, lineHeight: 17 },
});