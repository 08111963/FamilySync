import { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { apiRequest } from '@/lib/query-client';

const AGE_OPTIONS: { value: 'under14' | '14_17' | 'adult'; label: string }[] = [
  { value: 'under14', label: 'Meno di 14' },
  { value: '14_17', label: '14–17' },
  { value: 'adult', label: '18 o più' },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { refreshUser, logout } = useAuth();
  // Se l'utente stava aprendo un link d'invito, dopo l'onboarding torna lì.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const safeReturnTo = typeof returnTo === 'string' && /^\/join(-link)?\/[A-Za-z0-9_-]+$/.test(returnTo) ? returnTo : null;

  const [ageBand, setAgeBand] = useState<'under14' | '14_17' | 'adult' | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Consenso AI: MAI preselezionato (opt-in esplicito, GDPR).
  const [aiConsent, setAiConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!ageBand) {
      setError('Indica la tua fascia di età');
      return;
    }
    if (ageBand === 'under14') {
      setError('Sotto i 14 anni il profilo deve essere gestito da un genitore o tutore. Contatta assistenza@familysync.it per assistenza.');
      return;
    }
    if (!acceptedTerms) {
      setError("Devi dichiarare di aver letto la Privacy Policy e accettare i Termini d'Uso");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest('POST', '/api/auth/onboarding', {
        ageBand,
        acceptedTerms: true,
        aiConsent,
      });
      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace((safeReturnTo || '/') as any);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message || 'Salvataggio non riuscito. Riprova.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LinearGradient
      colors={isDark ? ['#1a1a2e', '#16213e'] : ['#EEF2FF', '#E0E7FF']}
      style={styles.gradient}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 24, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.text }]}>Un ultimo passaggio</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Abbiamo aggiornato la nostra Privacy Policy. Per continuare a usare FamilySync ti chiediamo la fascia di età e l'accettazione dei Termini d'Uso.
        </Text>

        {!!error && (
          <View style={[styles.errorBox, { backgroundColor: colors.error + '15' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        <Text style={[styles.label, { color: colors.textSecondary }]}>Fascia di età</Text>
        <View style={styles.ageRow}>
          {AGE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[
                styles.ageOption,
                { borderColor: colors.border, backgroundColor: colors.surface },
                ageBand === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAgeBand(opt.value);
              }}
              testID={`age-option-${opt.value}`}
            >
              <Text style={[styles.ageOptionText, { color: ageBand === opt.value ? '#fff' : colors.textSecondary }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {ageBand === 'under14' && (
          <Text style={[styles.ageWarning, { color: colors.error }]}>
            Sotto i 14 anni il profilo deve essere gestito da un genitore o tutore all'interno della famiglia.
          </Text>
        )}

        <Pressable
          style={styles.termsRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setAcceptedTerms(!acceptedTerms);
          }}
          testID="terms-checkbox"
        >
          <View style={[styles.checkbox, { borderColor: colors.border }, acceptedTerms && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            {acceptedTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text style={[styles.termsText, { color: colors.textSecondary }]}>
            Dichiaro di aver letto la{' '}
            <Text
              style={[styles.termsLink, { color: colors.primary }]}
              onPress={(e) => { e.stopPropagation?.(); router.push('/legal/privacy'); }}
            >
              Privacy Policy
            </Text>
            {' '}e accetto i{' '}
            <Text
              style={[styles.termsLink, { color: colors.primary }]}
              onPress={(e) => { e.stopPropagation?.(); router.push('/legal/terms'); }}
            >
              Termini d'Uso
            </Text>
            .
          </Text>
        </Pressable>

        {ageBand !== 'under14' && (
          <Pressable
            style={styles.termsRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAiConsent(!aiConsent);
            }}
            testID="ai-consent-checkbox"
          >
            <View style={[styles.checkbox, { borderColor: colors.border }, aiConsent && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              {aiConsent && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[styles.termsText, { color: colors.textSecondary }]}>
              (Facoltativo) Attivo le funzioni di intelligenza artificiale: alcuni dati minimizzati verranno inviati al fornitore AI (OpenAI) per generare i suggerimenti. Posso cambiare idea in qualsiasi momento dalle impostazioni.
            </Text>
          </Pressable>
        )}

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary }, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
          testID="submit-button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Continua</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => logout()} style={styles.logoutButton} testID="logout-button">
          <Text style={[styles.logoutText, { color: colors.textSecondary }]}>Esci dall'account</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 20 },
  errorBox: { borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 8, marginTop: 8 },
  ageRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  ageOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ageOptionText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  ageWarning: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 8 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  termsText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  termsLink: { fontFamily: 'Inter_600SemiBold' },
  submitButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  logoutButton: { alignItems: 'center', marginTop: 16 },
  logoutText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});
