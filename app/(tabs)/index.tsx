import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme';

type PantryItem = {
  id: string;
  name: string;
  category: string;
  expiry_date: string | null;
};

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalItems, setTotalItems] = useState(0);
  const [expiringSoon, setExpiringSoon] = useState(0);
  const [shoppingCount, setShoppingCount] = useState(0);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);

  const loadStats = useCallback(async () => {
    setLoading(true);

    const { count: total } = await supabase
      .from('pantry_items')
      .select('*', { count: 'exact', head: true });

    const fourDaysFromNow = new Date();
    fourDaysFromNow.setDate(fourDaysFromNow.getDate() + 4);
    const { count: expiring } = await supabase
      .from('pantry_items')
      .select('*', { count: 'exact', head: true })
      .lte('expiry_date', fourDaysFromNow.toISOString().split('T')[0]);

    const { count: shopping } = await supabase
      .from('shopping_list')
      .select('*', { count: 'exact', head: true })
      .eq('checked', false);

    const { data: items } = await supabase
      .from('pantry_items')
      .select('id, name, category, expiry_date')
      .order('expiry_date', { ascending: true })
      .limit(10);

    setTotalItems(total ?? 0);
    setExpiringSoon(expiring ?? 0);
    setShoppingCount(shopping ?? 0);
    setPantryItems(items ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const markItem = async (item: PantryItem, action: 'used' | 'wasted') => {
    const { error: logError } = await supabase.from('waste_log').insert({
      item_name: item.name,
      category: item.category,
      action,
    });

    if (logError) {
      Alert.alert('Could not log', logError.message);
      return;
    }

    const { error: deleteError } = await supabase.from('pantry_items').delete().eq('id', item.id);

    if (deleteError) {
      Alert.alert('Could not remove item', deleteError.message);
      return;
    }

    loadStats();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logo}><Text style={{ fontSize: 17 }}>🥫</Text></View>
          <View>
            <Text style={styles.title}>Good morning</Text>
            <Text style={styles.subtitle}>Your pantry today</Text>
          </View>
        </View>
        <View style={styles.avatar}><Text>🙂</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <>
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={[styles.statN, { color: colors.amber }]}>{expiringSoon}</Text>
                <Text style={styles.statL}>Expiring soon</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statN, { color: colors.primary }]}>{totalItems}</Text>
                <Text style={styles.statL}>Items in pantry</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statN}>{shoppingCount}</Text>
                <Text style={styles.statL}>On shopping list</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Quick actions</Text>
            <View style={styles.quickGrid}>
              <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/add')}>
                <Text style={{ fontSize: 22 }}>📷</Text>
                <Text style={styles.quickTitle}>Add item</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/recipes')}>
                <Text style={{ fontSize: 22 }}>🍳</Text>
                <Text style={styles.quickTitle}>Recipes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/list')}>
                <Text style={{ fontSize: 22 }}>🛒</Text>
                <Text style={styles.quickTitle}>Shopping list</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/stats')}>
                <Text style={{ fontSize: 22 }}>📊</Text>
                <Text style={styles.quickTitle}>Insights</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Your pantry</Text>
            {pantryItems.length === 0 ? (
              <Text style={styles.emptyText}>No items yet — tap "Add item" to get started.</Text>
            ) : (
              pantryItems.map((item) => (
                <View key={item.id} style={styles.pantryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pantryName}>{item.name}</Text>
                    {item.expiry_date ? (
                      <Text style={styles.pantryExpiry}>Expires {item.expiry_date}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity style={styles.markBtn} onPress={() => markItem(item, 'used')}>
                    <Text style={{ fontSize: 15 }}>✅</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.markBtn} onPress={() => markItem(item, 'wasted')}>
                    <Text style={{ fontSize: 15 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <View style={styles.nudge}>
              <Text style={styles.nudgeAmt}>$32 saved</Text>
              <Text style={styles.nudgeLab}>this month by using items before they expired 🎉</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.line },
  statN: { fontSize: 19, fontWeight: '700', color: colors.ink },
  statL: { fontSize: 10.5, color: colors.inkSoft, marginTop: 2, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 22, marginBottom: 10 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: { width: '47.5%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.line, gap: 8 },
  quickTitle: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
  emptyText: { fontSize: 12, color: colors.inkSoft, textAlign: 'center', marginTop: 10 },
  pantryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  pantryName: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
  pantryExpiry: { fontSize: 10.5, color: colors.inkSoft, marginTop: 1 },
  markBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  nudge: { marginTop: 18, backgroundColor: colors.primary, borderRadius: radius.xl, padding: 16 },
  nudgeAmt: { fontSize: 23, fontWeight: '700', color: colors.white },
  nudgeLab: { fontSize: 11.5, color: colors.white, opacity: 0.9, marginTop: 2 },
});