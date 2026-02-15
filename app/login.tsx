import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { login, signup } = useAuth();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Inserisci email e password');
      return;
    }

    if (isSignup) {
      if (!name.trim()) {
        setError('Inserisci il tuo nome');
        return;
      }
      if (password !== confirmPassword) {
        setError('Le password non coincidono');
        return;
      }
      if (password.length < 6) {
        setError('La password deve avere almeno 6 caratteri');
        return;
      }
      if (!acceptedTerms) {
        setError('Devi accettare Privacy Policy e Termini d\'Uso');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isSignup) {
        await signup(email.trim(), password, name.trim(), acceptedTerms);
      } else {
        await login(email.trim(), password);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (redirect) {
        router.replace(redirect as any);
        return;
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.message || '';
      if (msg.includes('Credenziali') || msg.includes('non valide')) {
        setError('Email o password non corretti');
      } else if (msg.includes('registrata') || msg.includes('EMAIL_EXISTS')) {
        setError('Questa email è già registrata');
      } else if (msg.includes('connessione') || msg.includes('Network') || msg.includes('fetch')) {
        setError('Errore di connessione. Verifica la tua connessione internet e riprova.');
      } else if (msg.includes('server') || msg.includes('Impossibile')) {
        setError('Server non raggiungibile. Riprova tra qualche secondo.');
      } else {
        setError(msg || (isSignup ? 'Errore nella registrazione' : 'Errore nel login'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSignup(!isSignup);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setAcceptedTerms(false);
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
              <Ionicons name="people" size={48} color="#fff" />
            </View>
            <Text style={styles.appName}>FamilySync</Text>
            <Text style={styles.tagline}>Coordinamento familiare intelligente</Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: isDark ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)' }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>
              {isSignup ? 'Crea Account' : 'Accedi'}
            </Text>

            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color="#E74C3C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {isSignup && (
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder="Nome"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  testID="name-input"
                />
              </View>
            )}

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
                testID="email-input"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.passwordInput, { color: colors.text, borderColor: colors.border }]}
                placeholder="Password"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                testID="password-input"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {isSignup && (
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder="Conferma Password"
                  placeholderTextColor={colors.textSecondary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  testID="confirm-password-input"
                />
              </View>
            )}

            {isSignup && (
              <Pressable
                style={styles.termsRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAcceptedTerms(!acceptedTerms);
                }}
                testID="terms-checkbox"
              >
                <View style={[
                  styles.checkbox,
                  { borderColor: colors.border },
                  acceptedTerms && styles.checkboxChecked,
                ]}>
                  {acceptedTerms && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
                <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                  Accetto la{' '}
                  <Text
                    style={[styles.termsLink, { color: colors.primary }]}
                    onPress={(e) => { e.stopPropagation?.(); router.push("/legal/privacy"); }}
                  >
                    Privacy Policy
                  </Text>
                  {' '}e i{' '}
                  <Text
                    style={[styles.termsLink, { color: colors.primary }]}
                    onPress={(e) => { e.stopPropagation?.(); router.push("/legal/terms"); }}
                  >
                    Termini d'Uso
                  </Text>
                </Text>
              </Pressable>
            )}

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
                <Text style={styles.submitButtonText}>
                  {isSignup ? 'Registrati' : 'Accedi'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleMode} style={styles.toggleButton} testID="toggle-mode">
              <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
                {isSignup ? 'Hai già un account? ' : 'Non hai un account? '}
                <Text style={[styles.toggleTextBold, { color: colors.primary }]}>
                  {isSignup ? 'Accedi' : 'Registrati'}
                </Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.legalRow}>
              <Pressable onPress={() => router.push("/legal/privacy")}>
                <Text style={[styles.legalLink, { color: colors.textSecondary }]}>Privacy Policy</Text>
              </Pressable>
              <Text style={[styles.legalSeparator, { color: colors.textSecondary }]}>|</Text>
              <Pressable onPress={() => router.push("/legal/terms")}>
                <Text style={[styles.legalLink, { color: colors.textSecondary }]}>Termini d'Uso</Text>
              </Pressable>
              <Text style={[styles.legalSeparator, { color: colors.textSecondary }]}>|</Text>
              <Pressable onPress={() => router.push("/help/user-guide")}>
                <Text style={[styles.legalLink, { color: colors.textSecondary }]}>Guida</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  formCard: {
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  formTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(231,76,60,0.1)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#E74C3C',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  inputIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
  input: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 44,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    padding: 4,
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
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  toggleButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  toggleTextBold: {
    fontFamily: 'Inter_600SemiBold',
  },
  termsRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  termsText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    flex: 1,
    lineHeight: 20,
  },
  termsLink: {
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline' as const,
  },
  legalRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 16,
  },
  legalLink: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textDecorationLine: 'underline' as const,
  },
  legalSeparator: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
