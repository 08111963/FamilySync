import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { apiRequest } from '@/lib/query-client';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Inserisci la tua email');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest('POST', '/api/auth/request-password-reset', { email: email.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.message || '';
      if (msg.includes('non configurato') || msg.includes('EMAIL_NOT_CONFIGURED') || msg.includes('503')) {
        setError('Il servizio email non è disponibile al momento. Riprova più tardi.');
      } else if (msg.includes('429') || msg.includes('Too many')) {
        setError('Troppi tentativi. Riprova tra qualche minuto.');
      } else {
        setError('Si è verificato un errore. Riprova tra qualche secondo.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  return (
    <LinearGradient
      colors={isDark ? ['#1a1a2e', '#16213e', '#0f3460'] : ['#FF6B6B', '#FF8E8E', '#FFA5A5']}
      style={styles.gradient}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + webTopInset + 40, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)' }]}>
              <Ionicons name="lock-closed" size={44} color="#fff" />
            </View>
            <Text style={styles.appName}>Password dimenticata</Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: isDark ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)' }]}>
            {sent ? (
              <View style={styles.successContainer}>
                <View style={[styles.successCircle, { backgroundColor: colors.success + '20' }]}>
                  <Ionicons name="mail-outline" size={40} color={colors.success} />
                </View>
                <Text style={[styles.formTitle, { color: colors.text }]}>Controlla la tua email</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Se l'indirizzo è associato a un account, ti abbiamo inviato un link per reimpostare la password. Il link scade tra un'ora.
                </Text>
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={() => router.replace('/login')}
                  activeOpacity={0.8}
                  testID="back-to-login"
                >
                  <Text style={styles.submitButtonText}>Torna all'accesso</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[styles.formTitle, { color: colors.text }]}>Reimposta password</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Inserisci la tua email: ti invieremo un link per scegliere una nuova password.
                </Text>

                {error ? (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color="#E74C3C" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    placeholder="Email"
                    placeholderTextColor={colors.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    testID="email-input"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                  testID="submit-button"
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Invia link</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.replace('/login')} style={styles.toggleButton} testID="back-link">
                  <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
                    Ti sei ricordato? <Text style={[styles.toggleTextBold, { color: colors.primary }]}>Accedi</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logoCircle: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  appName: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: -0.5, textAlign: 'center' },
  formCard: {
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  formTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(231,76,60,0.1)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: { color: '#E74C3C', fontFamily: 'Inter_500Medium', fontSize: 13, flex: 1 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  inputIcon: { position: 'absolute', left: 14, zIndex: 1 },
  input: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 44,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  submitButton: {
    backgroundColor: '#FF6B6B',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#fff', fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  toggleButton: { marginTop: 20, alignItems: 'center' },
  toggleText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  toggleTextBold: { fontFamily: 'Inter_600SemiBold' },
  successContainer: { alignItems: 'center', gap: 4 },
  successCircle: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
});
