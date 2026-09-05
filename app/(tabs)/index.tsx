import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getMyHouseholdId, getMyHouseholdInfo, HouseholdInfo, joinHouseholdByInviteCode } from '../../lib/household';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme';

type PantryItem = {
  id: string;
  name: string;
  category: string;
  expiry_date: string | null;
  added_by: string | null;
};

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalItems, setTotalItems] = useState(0);
  const [expiringSoon, setExpiringSoon] = useState(0);
  const [shoppingCount, setShoppingCount] = useState(0);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [householdInfo, setHouseholdInfo] = useState<HouseholdInfo | null>(null);
  const [showJoinBox, setShowJoinBox] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [myName, setMyName] = useState('');

  const loadStats = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    setMyName(user?.user_metadata?.full_name || user?.email?.split('@')[0] || '');

    const hhId = await getMyHouseholdId();
    setHouseholdId(hhId);

    const info = await getMyHouseholdInfo();
    setHouseholdInfo(info);

    if (!hhId) {
      setTotalItems(0);
      setExpiringSoon(0);
      setShoppingCount(0);
      setPantryItems([]);
      setLoading(false);
      return;
    }

    const { count: total } = await supabase
      .from('pantry_items')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', hhId);

    const fourDaysFromNow = new Date();
    fourDaysFromNow.setDate(fourDaysFromNow.getDate() + 4);
    const { count: expiring } = await supabase
      .from('pantry_items')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', hhId)
      .lte('expiry_date', fourDaysFromNow.toISOString().split('T')[0]);

    const { count: shopping } = await supabase
      .from('shopping_list')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', hhId)
      .eq('checked', false);

    const { data: items } = await supabase
      .from('pantry_items')
      .select('id, name, category, expiry_date, added_by')
      .eq('household_id', hhId)
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
    const { data: { user } } = await supabase.auth.getUser();

    const { error: logError } = await supabase.from('waste_log').insert({
      item_name: item.name,
      category: item.category,
      action,
      household_id: householdId,
      user_id: user?.id,
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

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Log out? You can log back in anytime.')) {
        supabase.auth.signOut();
      }
    } else {
      Alert.alert('Log out?', 'You can log back in anytime.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
          },
        },
      ]);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);

    const { data: { user } } = await supabase.auth.getUser();
    const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Member';

    const { error } = await joinHouseholdByInviteCode(joinCode, displayName);
    setJoining(false);

    if (error) {
      Alert.alert('Could not join', error);
      return;
    }

    setJoinCode('');
    setShowJoinBox(false);
    Alert.alert('Joined!', "You're now sharing a pantry with this household.");
    loadStats();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logo}><Text style={{ fontSize: 17 }}>🥫</Text></View>
          <View>
            <Text style={styles.title}>Good morning{myName ? `, ${myName}` : ''}</Text>
            <Text style={styles.subtitle}>Logged in as {myName || 'you'}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.avatar} onPress={handleSignOut}>
          <Text>🙂</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <>
            {householdInfo && (
              <View style={styles.householdCard}>
                <Text style={styles.householdName}>🏠 {householdInfo.name}</Text>
                <Text style={styles.householdSub}>
                  Invite code: <Text style={styles.inviteCode}>{householdInfo.inviteCode}</Text> — share this with family to let them join your pantry
                </Text>
                <TouchableOpacity onPress={() => setShowJoinBox(!showJoinBox)}>
                  <Text style={styles.joinLink}>
                    {showJoinBox ? 'Cancel' : 'Have a code from someone else? Join their household →'}
                  </Text>
                </TouchableOpacity>
                {showJoinBox && (
                  <View style={styles.joinRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Enter invite code"
                      value={joinCode}
                      onChangeText={setJoinCode}
                      autoCapitalize="characters"
                    />
                    <TouchableOpacity
                      style={[styles.joinBtn, joining && { opacity: 0.6 }]}
                      onPress={handleJoin}
                      disabled={joining}
                    >
                      <Text style={styles.joinBtnText}>{joining ? '…' : 'Join'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

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
                    <Text style={styles.pantryExpiry}>
                      {item.expiry_date ? `Expires ${item.expiry_date}` : ''}
                      {item.expiry_date && item.added_by ? ' · ' : ''}
                      {item.added_by ? `Added by ${item.added_by}` : ''}
                    </Text>
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
  householdCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, marginTop: 6, marginBottom: 4 },
  householdName: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  householdSub: { fontSize: 11, color: colors.inkSoft, marginTop: 4, lineHeight: 15 },
  inviteCode: { fontWeight: '700', color: colors.primaryDark },
  joinLink: { fontSize: 11.5, fontWeight: '700', color: colors.primary, marginTop: 8 },
  joinRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  joinBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  joinBtnText: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12.5, color: colors.ink },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
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