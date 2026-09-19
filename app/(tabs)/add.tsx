import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { categoryDefaults, colors, radius } from '../../theme';

const CATEGORIES = Object.keys(categoryDefaults); // Dairy, Produce, Meat, Canned, Bakery, Frozen
const UNITS = ['pcs', 'g', 'kg', 'ml', 'l'];
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

export default function AddItemScreen() {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('Dairy');
  const [customCategory, setCustomCategory] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('pcs');
  const [saving, setSaving] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const [manualExpiryDate, setManualExpiryDate] = useState<string | null>(null);

  const suggestedDays = categoryDefaults[category]?.days ?? 7;

  const defaultExpiryObj = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + suggestedDays);
    return d;
  }, [suggestedDays]);

    const expiryDateISO = manualExpiryDate ?? (() => {
    const y = defaultExpiryObj.getFullYear();
    const m = String(defaultExpiryObj.getMonth() + 1).padStart(2, '0');
    const d = String(defaultExpiryObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();
  const expiryDateDisplay = new Date(expiryDateISO + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

    const adjustDate = (days: number) => {
    const base = new Date(expiryDateISO + 'T00:00:00');
    base.setDate(base.getDate() + days);
    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    setManualExpiryDate(`${year}-${month}-${day}`);
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission needed', 'PantryPal needs camera access to scan product labels.');
        return;
      }
    }
    setScannerOpen(true);
  };

  const captureLabel = async () => {
    if (!cameraRef.current) return;
    setScanning(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      setScannerOpen(false);

      if (!photo?.uri) {
        Alert.alert('Capture failed', 'Could not take the photo. Please try again.');
        setScanning(false);
        return;
      }

      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 700 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!resized.base64) {
        Alert.alert('Capture failed', 'Could not process the photo. Please try again.');
        setScanning(false);
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const prompt = `Look at this product package photo. Read the printed product name, brand, and expiry/best-before date if visible.
Respond with ONLY a JSON object, no other text, no markdown, in this exact shape:
{"name": "Product Name", "brand": "Brand Name or empty string", "category": "one of: Dairy, Produce, Meat, Canned, Bakery, Frozen — best guess", "expiry_date": "YYYY-MM-DD or null if not visible"}
If you can't confidently read the name, set it to an empty string rather than guessing randomly.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY as string,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: 'image/jpeg', data: resized.base64 } },
                ],
              },
            ],
            generationConfig: { response_mime_type: 'application/json' },
          }),
        }
      );

      clearTimeout(timeout);
      const json = await response.json();

      if (!response.ok) {
        Alert.alert('Scan failed', json.error?.message || 'Unknown error from AI service.');
        setScanning(false);
        return;
      }

      const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const parsed = JSON.parse(raw);

      if (parsed.name) setName(parsed.name);
      if (parsed.brand) setBrand(parsed.brand);
      if (parsed.category && CATEGORIES.includes(parsed.category)) setCategory(parsed.category);
      if (parsed.expiry_date) setManualExpiryDate(parsed.expiry_date);

      if (parsed.name) {
        Alert.alert('Label read!', `Found "${parsed.name}" — check the details below and adjust if needed.`);
      } else {
        Alert.alert('Could not read label', "We couldn't confidently read the product details. Please fill them in manually.");
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        Alert.alert('Took too long', 'The scan timed out. Please try again, or enter manually.');
      } else {
        Alert.alert('Scan failed', 'Could not read the label. Please check your connection or fill in manually.');
      }
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter an item name before saving.');
      return;
    }
    if (category === 'Other' && !customCategory.trim()) {
      Alert.alert('Missing category', 'Please type a name for the custom category.');
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      Alert.alert('Not logged in', 'Please log in again.');
      return;
    }

    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id, full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const finalCategory = category === 'Other' ? customCategory.trim() : category;

    const { error } = await supabase.from('pantry_items').insert({
      name: name.trim(),
      brand: brand.trim() || null,
      category: finalCategory,
      quantity: qty,
      unit,
      expiry_date: expiryDateISO,
      added_by: membership?.full_name || 'You',
      household_id: membership?.household_id,
      user_id: user.id,
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
    setCustomCategory('');
    setQty(1);
    setUnit('pcs');
    setManualExpiryDate(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Text style={styles.title}>Add item</Text>
        <Text style={styles.subtitle}>Scan a label or enter manually</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.scanBox} activeOpacity={0.85} onPress={openScanner} disabled={scanning}>
          <Text style={styles.scanCta}>{scanning ? '🔎 Reading label…' : '📷 Scan product label'}</Text>
          {!scanning && <Text style={styles.scanSub}>Reads name, brand & expiry date right off the package</Text>}
        </TouchableOpacity>

        <Text style={styles.dividerText}>— OR ADD MANUALLY —</Text>

        <Text style={styles.fieldLabel}>Item name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Fresh Milk, Home-grown spinach" />

        <Text style={styles.fieldLabel}>Brand</Text>
        <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholder="e.g. Highland (optional)" />

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
          <TouchableOpacity
            style={[styles.chip, category === 'Other' && styles.chipSelected]}
            onPress={() => setCategory('Other')}
          >
            <Text style={[styles.chipText, category === 'Other' && styles.chipTextSelected]}>➕ Other</Text>
          </TouchableOpacity>
        </View>
        {category === 'Other' && (
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={customCategory}
            onChangeText={setCustomCategory}
            placeholder="e.g. Home-grown, Spices, Snacks"
          />
        )}

        <Text style={styles.fieldLabel}>Quantity</Text>
        <View style={styles.qtyRow}>
          <View style={styles.stepperRow}>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
              <Text style={styles.stepperBtnText}>–</Text>
            </TouchableOpacity>
            <Text style={styles.stepperVal}>{qty}</Text>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => setQty((q) => q + 1)}>
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.unitRow}>
            {UNITS.map((u) => {
              const selected = u === unit;
              return (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitChip, selected && styles.chipSelected]}
                  onPress={() => setUnit(u)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{u}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.fieldLabel}>Expiry date</Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustDate(-1)}>
            <Text style={styles.stepperBtnText}>–</Text>
          </TouchableOpacity>
          <Text style={[styles.stepperVal, { width: 120 }]}>{expiryDateDisplay}</Text>
          <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustDate(1)}>
            <Text style={styles.stepperBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.smartNote}>
          <Text style={styles.smartNoteText}>
            {manualExpiryDate
              ? '✏️ Date adjusted manually — use +/- above to fine-tune further.'
              : `🎯 ${category} usually lasts about ${suggestedDays} days — we've pre-filled the date. No label? Just tap +/- to approximate one yourself.`}
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
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerHint}>Center the product label, then tap capture</Text>
          </View>
          <View style={styles.scannerControls}>
            <TouchableOpacity style={styles.closeScannerBtn} onPress={() => setScannerOpen(false)}>
              <Text style={{ color: colors.white, fontSize: 15, fontWeight: '700' }}>✕ Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.captureBtn} onPress={captureLabel}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
            <View style={{ width: 90 }} />
          </View>
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
  scanSub: { fontSize: 10, color: colors.white, opacity: 0.7, textAlign: 'center', paddingHorizontal: 20 },
  dividerText: { textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.inkSoft, marginVertical: 16 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: colors.inkSoft, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  chipTextSelected: { color: colors.primaryDark },
  qtyRow: { gap: 10 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  stepperVal: { fontSize: 14, fontWeight: '700', color: colors.ink, width: 24, textAlign: 'center' },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  smartNote: { marginTop: 10, backgroundColor: colors.amberSoft, borderRadius: 13, padding: 12 },
  smartNoteText: { fontSize: 11.5, color: '#8a5423', lineHeight: 16, fontWeight: '600' },
  saveBtn: { marginTop: 22, backgroundColor: colors.primary, borderRadius: 15, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 14.5, fontWeight: '700', color: colors.white },
  scannerOverlay: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' },
  scannerHint: { color: colors.white, fontSize: 13, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, textAlign: 'center' },
  scannerControls: { position: 'absolute', bottom: 50, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  closeScannerBtn: { width: 90, backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 12, borderRadius: 24, alignItems: 'center' },
  captureBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.white },
  captureBtnInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.white },
});