import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing info', 'Please enter both email and password.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('Missing info', 'Please enter your name.');
      return;
    }

    setLoading(true);

        if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: { full_name: name.trim() },
        },
      });

      if (error) {
        setLoading(false);
        Alert.alert('Could not sign up', error.message);
        return;
      }

      if (data.session && data.user) {
        // Give every new person their own household to start —
        // they (or family members) can join an existing one instead via an invite code.
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const { data: household, error: householdError } = await supabase
          .from('households')
          .insert({ name: `${name.trim()}'s Household`, invite_code: inviteCode })
          .select()
          .single();

        if (householdError) {
          setLoading(false);
          Alert.alert('Account created, but household setup failed', householdError.message);
          return;
        }

        await supabase.from('household_members').insert({
          household_id: household.id,
          user_id: data.user.id,
          full_name: name.trim(),
        });

        setLoading(false);
        router.replace('/(tabs)');
      } else {
        setLoading(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });
      setLoading(false);

      if (error) {
        Alert.alert('Could not log in', error.message);
        return;
      }
      router.replace('/(tabs)');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <View style={styles.logo}><Text style={{ fontSize: 28 }}>🥫</Text></View>
        <Text style={styles.appName}>PantryPal</Text>
        <Text style={styles.tagline}>
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </Text>

        {mode === 'signup' && (
          <>
            <Text style={styles.fieldLabel}>Your name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Nawodya"
              autoCapitalize="words"
            />
          </>
        )}

        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.fieldLabel}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitBtnText}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          <Text style={styles.switchText}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <Text style={styles.switchTextBold}>{mode === 'login' ? 'Sign up' : 'Log in'}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo: {
    width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12,
  },
  appName: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  tagline: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: 4, marginBottom: 28 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: colors.inkSoft, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: colors.ink,
  },
  submitBtn: { marginTop: 24, backgroundColor: colors.primary, borderRadius: 15, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { fontSize: 14.5, fontWeight: '700', color: colors.white },
  switchText: { textAlign: 'center', marginTop: 18, fontSize: 12.5, color: colors.inkSoft },
  switchTextBold: { fontWeight: '700', color: colors.primary },
});