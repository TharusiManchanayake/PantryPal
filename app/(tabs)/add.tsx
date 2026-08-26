import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { colors, radius, categoryDefaults } from '../../theme';
import { supabase } from '../../lib/supabase';

const CATEGORIES = Object.keys(categoryDefaults);

export default function AddItemScreen() {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('Dairy');
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const suggestedDays = categoryDefaults[category]?.days ?? 7;

  const expiryDateObj = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + suggestedDays);
    return d;
  }, [suggestedDays]);

  const expiryDateDisplay = expiryDateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const expiryDateISO = expiryDateObj.toISOString().split('T')[0];

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission needed', 'PantryPal needs camera access to scan barcodes.');
        return;
      }
    }
    setScanned(false);
    setScannerOpen(true);
  };

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    setScannerOpen(false);
    setLookingUp(true);

    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${result.data}.json`);
      const json = await res.json();

      if (json.status === 1 && json.product) {
        setName(json.product.product_name || '');
        setBrand(json.product.brands || '');
        Alert.alert('Found it!', `${json.product.product_name || 'Product'} — details filled in below.`);
      } else {
        Alert.alert('Not found', "This barcode isn't in the product database. Please fill the details in manually.");
      }
    } catch (e) {
      Alert.alert('Lookup failed', 'Could not reach the product database. Please check your internet connection.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter an item name before saving.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('pantry_items').insert({
      name: name.trim(),
      brand: brand.trim() || null,
      category,
      quantity: qty,
      expiry_date: expiryDateISO,
      added_by: 'You',
    });
    setSaving(false);

    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }

    Alert.alert('Saved!', `${name} was added to your pantry.`);
    setName('');
    setBrand('');
    setCategory('Dairy');
    setQty(1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Text style={styles.title}>Add item</Text>
        <Text style={styles.subtitle}>Scan or enter manually</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.scanBox} activeOpacity={0.85} onPress={openScanner} disabled={lookingUp}>
          <Text style={styles.scanCta}>{lookingUp ? '🔎 Looking up product…' : '📷 Point camera at barcode'}</Text>
          {!lookingUp && <Text style={styles.scanSub}>Opens instantly · auto-fills name & brand</Text>}
        </TouchableOpacity>

        <Text style={styles.dividerText}>— OR ADD MANUALLY —</Text>

        <Text style={styles.fieldLabel}>Item name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Fresh Milk 1L" />

        <Text style={styles.fieldLabel}>Brand</Text>
        <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholder="e.g. Highland" />

        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((cat) => {
            const selected = cat === category;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setCategory(cat)}
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
          <TouchableOpacity style={styles.stepperBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
            <Text style={styles.stepperBtnText}>–</Text>
          </TouchableOpacity>
          <Text style={styles.stepperVal}>{qty}</Text>
          <TouchableOpacity style={styles.stepperBtn} onPress={() => setQty((q) => q + 1)}>
            <Text style={styles.stepperBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Expiry date</Text>
        <View style={styles.input}><Text>{expiryDateDisplay}</Text></View>
        <View style={styles.smartNote}>
          <Text style={styles.smartNoteText}>
            🎯 {category} usually lasts about {suggestedDays} days — we've pre-filled the date.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          activeOpacity={0.85}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save to pantry'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerHint}>Point at a barcode</Text>
          </View>
          <TouchableOpacity style={styles.closeScannerBtn} onPress={() => setScannerOpen(false)}>
            <Text style={{ color: colors.white, fontSize: 16, fontWeight: '700' }}>✕ Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  scanBox: { borderRadius: radius.xl, backgroundColor: '#0d1410', height: 140, alignItems: 'center', justifyContent: 'center', gap: 6 },
  scanCta: { fontSize: 13, fontWeight: '700', color: colors.white },
  scanSub: { fontSize: 10, color: colors.white, opacity: 0.7 },
  dividerText: { textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.inkSoft, marginVertical: 16 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: colors.inkSoft, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  chipTextSelected: { color: colors.primaryDark },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  stepperVal: { fontSize: 16, fontWeight: '700', color: colors.ink, width: 24, textAlign: 'center' },
  smartNote: { marginTop: 10, backgroundColor: colors.amberSoft, borderRadius: 13, padding: 12 },
  smartNoteText: { fontSize: 11.5, color: '#8a5423', lineHeight: 16, fontWeight: '600' },
  saveBtn: { marginTop: 22, backgroundColor: colors.primary, borderRadius: 15, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 14.5, fontWeight: '700', color: colors.white },
  scannerOverlay: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' },
  scannerHint: { color: colors.white, fontSize: 14, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  closeScannerBtn: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
});