import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme';

type Item = {
  id: string;
  name: string;
  note: string | null;
  category: string | null;
  added_by: string | null;
  checked: boolean;
};

export default function ShoppingListScreen() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('shopping_list')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      Alert.alert('Could not load list', error.message);
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const toggle = async (item: Item) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));

    const { error } = await supabase
      .from('shopping_list')
      .update({ checked: !item.checked })
      .eq('id', item.id);

    if (error) {
      Alert.alert('Could not update', error.message);
      loadItems();
    }
  };

  const addItem = async () => {
    if (!newItem.trim()) return;
    setAdding(true);

    const { error } = await supabase.from('shopping_list').insert({
      name: newItem.trim(),
      category: 'Other',
      added_by: 'You',
      checked: false,
    });

    setAdding(false);

    if (error) {
      Alert.alert('Could not add item', error.message);
      return;
    }

    setNewItem('');
    loadItems();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Text style={styles.title}>Shopping list</Text>
        <Text style={styles.subtitle}>Shared with your family</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : items.length === 0 ? (
          <Text style={styles.emptyText}>Your list is empty — add something below 👇</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.row}>
              <TouchableOpacity
                style={[styles.checkbox, item.checked && styles.checkboxChecked]}
                onPress={() => toggle(item)}
              >
                {item.checked && <Text style={{ color: colors.white, fontSize: 12 }}>✓</Text>}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, item.checked && styles.itemNameDone]}>{item.name}</Text>
                {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
              </View>
              {item.added_by ? (
                <View style={styles.itemTag}><Text style={styles.itemTagText}>{item.added_by}</Text></View>
              ) : null}
            </View>
          ))
        )}

        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Add an item…"
            value={newItem}
            onChangeText={setNewItem}
            onSubmitEditing={addItem}
          />
          <TouchableOpacity style={[styles.addBtn, adding && { opacity: 0.6 }]} onPress={addItem} disabled={adding}>
            <Text style={{ color: colors.white, fontSize: 19 }}>{adding ? '…' : '＋'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  emptyText: { textAlign: 'center', color: colors.inkSoft, fontSize: 12.5, marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  checkbox: { width: 21, height: 21, borderRadius: 7, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  itemName: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
  itemNameDone: { textDecorationLine: 'line-through', color: colors.inkSoft },
  itemNote: { fontSize: 10.5, color: colors.inkSoft, fontStyle: 'italic', marginTop: 1 },
  itemTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  itemTagText: { fontSize: 9, fontWeight: '700', color: colors.primaryDark },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: colors.ink },
  addBtn: { width: 42, backgroundColor: colors.primary, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});