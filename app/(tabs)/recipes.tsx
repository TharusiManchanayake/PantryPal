import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getMyHouseholdId } from '../../lib/household';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme';

type Recipe = {
  title: string;
  emoji: string;
  minutes: number;
  difficulty: string;
  haveCount: number;
  missingItems: string[];
};

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

export default function RecipesScreen() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [pantryEmpty, setPantryEmpty] = useState(false);

  const generateRecipes = useCallback(async () => {
    setLoading(true);

    const hhId = await getMyHouseholdId();

    if (!hhId) {
      setPantryEmpty(true);
      setLoading(false);
      return;
    }

    const { data: pantryItems, error: pantryError } = await supabase
      .from('pantry_items')
      .select('name, category')
      .eq('household_id', hhId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (pantryError) {
      Alert.alert('Could not load pantry', pantryError.message);
      setLoading(false);
      return;
    }

    if (!pantryItems || pantryItems.length === 0) {
      setPantryEmpty(true);
      setLoading(false);
      return;
    }
    setPantryEmpty(false);

    const itemNames = pantryItems.map((i) => i.name).join(', ');

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [
            {
              role: 'user',
              content: `I have these ingredients at home: ${itemNames}.
Suggest 4 simple recipes I could make, prioritizing ones that use the most of these ingredients.
Respond with ONLY a JSON object with a "recipes" array, no other text, no markdown formatting, in this exact shape:
{"recipes": [{"title": "Recipe Name", "emoji": "🍝", "minutes": 25, "difficulty": "Easy", "haveCount": 4, "missingItems": ["item1", "item2"]}]}
haveCount = how many of MY ingredients it uses. missingItems = up to 2 extra things needed that I don't have (empty array if none). Keep titles short.`,
            },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      const json = await response.json();
      const raw = json.choices?.[0]?.message?.content ?? '{"recipes":[]}';
      const parsed = JSON.parse(raw);
      setRecipes(parsed.recipes ?? []);
    } catch (e) {
      Alert.alert('Recipe generation failed', 'Could not reach the AI service. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      generateRecipes();
    }, [generateRecipes])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Recipe ideas</Text>
          <Text style={styles.subtitle}>Built from what's in your pantry</Text>
        </View>
        <TouchableOpacity onPress={generateRecipes} disabled={loading}>
          <Text style={{ fontSize: 18 }}>🔄</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={{ marginTop: 40, alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.inkSoft, fontSize: 12 }}>Thinking of something tasty…</Text>
          </View>
        ) : pantryEmpty ? (
          <Text style={styles.emptyText}>
            Your pantry is empty — add a few items first, then come back for recipe ideas 🍽️
          </Text>
        ) : recipes.length === 0 ? (
          <Text style={styles.emptyText}>Couldn't generate recipes right now — pull to try again.</Text>
        ) : (
          recipes.map((r) => (
            <View key={r.title} style={styles.card}>
              <View style={styles.imgBox}>
                <Text style={{ fontSize: 40 }}>{r.emoji}</Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.recipeTitle}>{r.title}</Text>
                <Text style={styles.meta}>⏱ {r.minutes} min · {r.difficulty}</Text>
                <View style={styles.tagRow}>
                  <View style={[styles.tag, styles.tagHave]}>
                    <Text style={styles.tagHaveText}>✅ Uses {r.haveCount} items you have</Text>
                  </View>
                  {r.missingItems?.length > 0 && (
                    <View style={[styles.tag, styles.tagMissing]}>
                      <Text style={styles.tagMissingText}>
                        🛒 Missing {r.missingItems.length} · {r.missingItems.join(', ')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 40, gap: 14 },
  emptyText: { textAlign: 'center', color: colors.inkSoft, fontSize: 12.5, marginTop: 40, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  imgBox: { height: 110, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14 },
  recipeTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  meta: { fontSize: 10.5, color: colors.inkSoft, marginBottom: 9 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill },
  tagHave: { backgroundColor: colors.primarySoft },
  tagHaveText: { fontSize: 10, fontWeight: '700', color: colors.primaryDark },
  tagMissing: { backgroundColor: colors.amberSoft },
  tagMissingText: { fontSize: 10, fontWeight: '700', color: '#8a5423' },
});