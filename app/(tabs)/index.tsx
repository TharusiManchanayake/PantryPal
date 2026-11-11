import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getMyHouseholdId, getMyHouseholdInfo, HouseholdInfo, joinHouseholdByInviteCode } from '../../lib/household';
import { supabase } from '../../lib/supabase';
import { categoryDefaults, colors, radius } from '../../theme';

const CATEGORIES = Object.keys(categoryDefaults);

// Same estimate used on the Insights screen — keep these two in sync if this
// ever changes to use real item prices instead of a flat guess.
const ESTIMATED_VALUE_PER_ITEM = 2.5;

type PantryItem = {
  id: string;
  name: string;
  category: string;
  expiry_date: string | null;
  added_by: string | null;
  quantity: number;
};

// Builds YYYY-MM-DD from LOCAL date parts. toISOString() converts to UTC first,
// which shifts dates by a day in timezones ahead of UTC (like Sri Lanka).
function toLocalISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [savedThisMonth, setSavedThisMonth] = useState(0);
  const [usedThisMonthCount, setUsedThisMonthCount] = useState(0);

  // Edit modal state
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Dairy');
  const [editQty, setEditQty] = useState(1);
  const [editExpiryISO, setEditExpiryISO] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // In-app confirmation dialogs (replace the browser's plain confirm box)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const showNotice = (title: string, message: string) => setNotice({ title, message });

  const loadStats = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    setMyName(user?.user_metadata?.full_name || user?.email?.split('@')[0] || '');

    const hhId = await getMyHouseholdId();
    setHouseholdId(hhId);

    const info = await getMyHouseholdInfo();
    setHouseholdInfo(info);

    // Names of the other people sharing this pantry
    const { data: names } = await supabase.rpc('household_member_names');
    setSharedWith(Array.isArray(names) ? (names as string[]) : []);

    if (!hhId) {
      setTotalItems(0);
      setExpiringSoon(0);
      setShoppingCount(0);
      setPantryItems([]);
      setSavedThisMonth(0);
      setUsedThisMonthCount(0);
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
      .lte('expiry_date', toLocalISODate(fourDaysFromNow));

    const { count: shopping } = await supabase
      .from('shopping_list')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', hhId)
      .eq('checked', false);

    const { data: items } = await supabase
      .from('pantry_items')
      .select('id, name, category, expiry_date, added_by, quantity')
      .eq('household_id', hhId)
      .order('expiry_date', { ascending: true })
      .limit(10);

    // Real savings: items marked "used" (not wasted) so far this calendar month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: usedCount } = await supabase
      .from('waste_log')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', hhId)
      .eq('action', 'used')
      .gte('created_at', startOfMonth.toISOString());

    setTotalItems(total ?? 0);
    setExpiringSoon(expiring ?? 0);
    setShoppingCount(shopping ?? 0);
    setPantryItems(items ?? []);
    setUsedThisMonthCount(usedCount ?? 0);
    setSavedThisMonth((usedCount ?? 0) * ESTIMATED_VALUE_PER_ITEM);
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
      showNotice('Could not log', logError.message);
      return;
    }

    const { error: deleteError } = await supabase.from('pantry_items').delete().eq('id', item.id);

    if (deleteError) {
      showNotice('Could not remove item', deleteError.message);
      return;
    }

    loadStats();
  };

  const confirmSignOut = async () => {
    setShowLogoutConfirm(false);
    await supabase.auth.signOut();
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);

    const { data: { user } } = await supabase.auth.getUser();
    const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Member';

    const { error } = await joinHouseholdByInviteCode(joinCode, displayName);
    setJoining(false);

    if (error) {
      showNotice('Could not join', error);
      return;
    }

    setJoinCode('');
    setShowJoinBox(false);
    showNotice('Joined!', "You're now sharing a pantry with this household.");
    loadStats();
  };

  const openEdit = (item: PantryItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditQty(item.quantity || 1);
    setEditExpiryISO(item.expiry_date || toLocalISODate(new Date()));
  };

  const closeEdit = () => {
    setShowDeleteConfirm(false);
    setEditingItem(null);
  };

  const saveEdit = async () => {
    if (!editingItem || !editName.trim()) return;
    setSavingEdit(true);

    const { error } = await supabase
      .from('pantry_items')
      .update({
        name: editName.trim(),
        category: editCategory,
        quantity: editQty,
        expiry_date: editExpiryISO,
      })
      .eq('id', editingItem.id);

    setSavingEdit(false);

    if (error) {
      showNotice('Could not save', error.message);
      return;
    }

    closeEdit();
    loadStats();
  };

  const confirmDelete = async () => {
    if (!editingItem) return;
    const { error } = await supabase.from('pantry_items').delete().eq('id', editingItem.id);
    if (error) {
      setShowDeleteConfirm(false);
      showNotice('Could not delete', error.message);
      return;
    }
    closeEdit();
    loadStats();
  };

  const adjustEditDate = (days: number) => {
    const d = new Date(editExpiryISO + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setEditExpiryISO(toLocalISODate(d));
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
        <TouchableOpacity style={styles.avatar} onPress={() => setShowLogoutConfirm(true)}>
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
                <Text style={styles.householdName}>🏠 {myName ? `${myName}'s code` : 'Your code'}</Text>
                <Text style={styles.householdSub}>
                  Invite code: <Text style={styles.inviteCode}>{householdInfo.inviteCode}</Text> — this is your own code and never changes
                </Text>
                {sharedWith.length > 0 && (
                  <Text style={styles.householdSub}>
                    Sharing a pantry with: <Text style={styles.inviteCode}>{sharedWith.join(', ')}</Text>
                  </Text>
                )}
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
            <Text style={styles.hint}>Tap an item to edit or delete it</Text>
            {pantryItems.length === 0 ? (
              <Text style={styles.emptyText}>No items yet — tap "Add item" to get started.</Text>
            ) : (
              pantryItems.map((item) => (
                <View key={item.id} style={styles.pantryRow}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => openEdit(item)}>
                    <Text style={styles.pantryName}>{item.name}</Text>
                    <Text style={styles.pantryExpiry}>
                      {item.expiry_date ? `Expires ${item.expiry_date}` : ''}
                      {item.expiry_date && item.added_by ? ' · ' : ''}
                      {item.added_by ? `Added by ${item.added_by}` : ''}
                    </Text>
                  </TouchableOpacity>
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
              <Text style={styles.nudgeAmt}>${savedThisMonth.toFixed(2)} saved</Text>
              <Text style={styles.nudgeLab}>
                {usedThisMonthCount > 0
                  ? `this month from ${usedThisMonthCount} item${usedThisMonthCount === 1 ? '' : 's'} used before they expired 🎉`
                  : 'Mark items ✅ used before they expire to start tracking savings'}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!editingItem} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={styles.editOverlay}>
          <View style={styles.editSheet}>
            <Text style={styles.editTitle}>Edit item</Text>

            <Text style={styles.fieldLabel}>Item name</Text>
            <TextInput style={styles.input} value={editName} onChangeText={setEditName} />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => {
                const selected = cat === editCategory;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setEditCategory(cat)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {categoryDefaults[cat].emoji} {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Quantity</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setEditQty((q) => Math.max(1, q - 1))}>
                <Text style={styles.stepperBtnText}>–</Text>
              </TouchableOpacity>
              <Text style={styles.stepperVal}>{editQty}</Text>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setEditQty((q) => q + 1)}>
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Expiry date</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustEditDate(-1)}>
                <Text style={styles.stepperBtnText}>–</Text>
              </TouchableOpacity>
              <Text style={[styles.stepperVal, { width: 110 }]}>{editExpiryISO}</Text>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustEditDate(1)}>
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.editBtnRow}>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => setShowDeleteConfirm(true)}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeEdit}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveEditBtn, savingEdit && { opacity: 0.6 }]}
                onPress={saveEdit}
                disabled={savingEdit}
              >
                <Text style={styles.saveEditBtnText}>{savingEdit ? '…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ConfirmDialog
            inline
            visible={!!notice && !!editingItem}
            title={notice?.title ?? ''}
            message={notice?.message ?? ''}
            hideCancel
            onConfirm={() => setNotice(null)}
            onCancel={() => setNotice(null)}
          />
          {/* Rendered inline inside the edit Modal — stacking two real Modals is unreliable on iPhones */}
          <ConfirmDialog
            inline
            visible={showDeleteConfirm}
            emoji="🗑️"
            title="Delete this item?"
            message={`"${editingItem?.name ?? ''}" will be removed. This won't count as used or wasted.`}
            confirmLabel="Delete"
            destructive
            onConfirm={confirmDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!notice && !editingItem}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        hideCancel
        onConfirm={() => setNotice(null)}
        onCancel={() => setNotice(null)}
      />

      <ConfirmDialog
        visible={showLogoutConfirm}
        emoji="👋"
        title="Log out?"
        message="You can log back in anytime."
        confirmLabel="Log out"
        onConfirm={confirmSignOut}
        onCancel={() => setShowLogoutConfirm(false)}
      />
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
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 22, marginBottom: 2 },
  hint: { fontSize: 10.5, color: colors.inkSoft, marginBottom: 8 },
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
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  editSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  editTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: colors.inkSoft, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  chipTextSelected: { color: colors.primaryDark },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  stepperVal: { fontSize: 14, fontWeight: '700', color: colors.ink, width: 24, textAlign: 'center' },
  editBtnRow: { flexDirection: 'row', gap: 8, marginTop: 24 },
  deleteBtn: { flex: 1, backgroundColor: colors.redSoft, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  deleteBtnText: { color: colors.red, fontWeight: '700', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.inkSoft, fontWeight: '700', fontSize: 13 },
  saveEditBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  saveEditBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
});