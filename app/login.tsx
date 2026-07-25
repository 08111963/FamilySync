import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { loginWithGoogle, loginWithApple, isAppleLoginAvailable, completeOauth, claimLoginCode, isSignupPending } from '@/lib/social-login';

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'La password deve avere almeno 8 caratteri';
  if (!/[a-z]/.test(pw)) return 'La password deve contenere almeno una lettera minuscola';
  if (!/[A-Z]/.test(pw)) return 'La password deve contenere almeno una lettera maiuscola';
  if (!/[0-9]/.test(pw)) return 'La password deve contenere almeno un numero';
  return null;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { login, signup, applySession } = useAuth();
  const { redirect, loginCode, signupToken, suggestedName } = useLocalSearchParams<{ redirect?: string; loginCode?: string; signupToken?: string; suggestedName?: string }>();

  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ageBand, setAgeBand] = useState<'under14' | '14_17' | 'adult' | null>(null);
  // Consenso AI: MAI preselezionato (opt-in esplicito, GDPR).
  const [aiConsent, setAiConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialSubmitting, setSocialSubmitting] = useState<'google' | 'apple' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    isAppleLoginAvailable().then(setAppleAvailable).catch(() => {});
  }, []);

  // Sul web (soprattutto mobile) il ritorno da Google ricarica l'app:
  // il codice di login arriva come parametro nell'URL e va completato qui.
  // Nuovo utente social (ritorno da Google sul web): completa la registrazione.
  const signupHandled = useRef(false);
  useEffect(() => {
    if (!signupToken || signupHandled.current) return;
    signupHandled.current = true;
    router.replace({
      pathname: '/social-complete',
      params: { signupToken, suggestedName: suggestedName || '' },
    } as any);
  }, [signupToken]);

  const oauthHandled = useRef(false);
  useEffect(() => {
    if (!loginCode || oauthHandled.current) return;
    oauthHandled.current = true;
    // Il codice è monouso: se loginWithGoogle lo sta già scambiando, non
    // riprovare qui (fallirebbe con "codice già usato").
    if (!claimLoginCode(loginCode)) return;
    setSocialSubmitting('google');
    setError('');
    completeOauth(loginCode)
      .then(async (session) => {
        await applySession(session.user, session.accessToken, session.refreshToken);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace((redirect as any) || '/');
      })
      .catch((err: any) => {
        setError(err?.message || 'Accesso non riuscito. Riprova.');
        // Pulisce il codice (monouso) dall'URL per evitare nuovi tentativi falliti.
        router.replace('/login');
      })
      .finally(() => setSocialSubmitting(null));
  }, [loginCode]);

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    if (isSubmitting || socialSubmitting) return;
    setError('');
    setSocialSubmitting(provider);
    try {
      const result = provider === 'google' ? await loginWithGoogle() : await loginWithApple();
      if (!result) return; // utente ha annullato
      if (isSignupPending(result)) {
        // Nuovo utente: nessun account creato finché non completa la registrazione.
        router.push({
          pathname: '/social-complete',
          params: { signupToken: result.signupToken, suggestedName: result.suggestedName || '' },
        } as any);
        return;
      }
      const session = result;
      await applySession(session.user, session.accessToken, session.refreshToken);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (redirect) {
        router.replace(redirect as any);
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message || 'Accesso non riuscito. Riprova.');
    } finally {
      setSocialSubmitting(null);
    }
  };

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
      const pwError = validatePassword(password);
      if (pwError) {
        setError(pwError);
        return;
      }
      if (!ageBand) {
        setError('Indica la tua fascia di età');
        return;
      }
      if (ageBand === 'under14') {
        setError('Per creare un account da solo/a devi avere almeno 14 anni. Chiedi a un genitore di creare il tuo profilo nella famiglia.');
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
        await signup(email.trim(), password, name.trim(), acceptedTerms, ageBand === 'under14' ? undefined : (ageBand ?? undefined), aiConsent);
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
    setAgeBand(null);
    setAiConsent(false);
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
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.logoImage}
              contentFit="cover"
            />
            <Text style={styles.appName}>FamilySync</Text>
            <Text style={styles.tagline}>La tua famiglia, finalmente sincronizzata</Text>
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
                autoComplete="email"
                textContentType="emailAddress"
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
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                textContentType={isSignup ? 'newPassword' : 'password'}
                testID="password-input"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {!isSignup && (
              <TouchableOpacity
                onPress={() => router.push('/forgot-password')}
                style={styles.forgotButton}
                testID="forgot-password-link"
              >
                <Text style={[styles.forgotText, { color: colors.primary }]}>Password dimenticata?</Text>
              </TouchableOpacity>
            )}

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
              <View style={styles.ageSection}>
                <Text style={[styles.ageLabel, { color: colors.textSecondary }]}>La tua età</Text>
                <View style={styles.ageRow}>
                  {([
                    { value: 'under14' as const, label: 'Meno di 14' },
                    { value: '14_17' as const, label: '14-17 anni' },
                    { value: 'adult' as const, label: '18 o più' },
                  ]).map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.ageOption,
                        { borderColor: colors.border },
                        ageBand === opt.value && styles.ageOptionSelected,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setAgeBand(opt.value);
                        setError('');
                      }}
                      testID={`age-option-${opt.value}`}
                    >
                      <Text style={[
                        styles.ageOptionText,
                        { color: ageBand === opt.value ? '#fff' : colors.textSecondary },
                      ]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {ageBand === 'under14' && (
                  <Text style={styles.ageWarning}>
                    Per creare un account da solo/a devi avere almeno 14 anni. Chiedi a un genitore o tutore di creare il tuo profilo all'interno della famiglia.
                  </Text>
                )}
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
                  Dichiaro di aver letto la{' '}
                  <Text
                    style={[styles.termsLink, { color: colors.primary }]}
                    onPress={(e) => { e.stopPropagation?.(); router.push("/legal/privacy"); }}
                  >
                    Privacy Policy
                  </Text>
                  {' '}e accetto i{' '}
                  <Text
                    style={[styles.termsLink, { color: colors.primary }]}
                    onPress={(e) => { e.stopPropagation?.(); router.push("/legal/terms"); }}
                  >
                    Termini d'Uso
                  </Text>
                  .
                </Text>
              </Pressable>
            )}

            {isSignup && ageBand !== 'under14' && (
              <Pressable
                style={styles.termsRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAiConsent(!aiConsent);
                }}
                testID="ai-consent-checkbox"
              >
                <View style={[
                  styles.checkbox,
                  { borderColor: colors.border },
                  aiConsent && styles.checkboxChecked,
                ]}>
                  {aiConsent && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
                <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                  (Facoltativo) Attivo le funzioni di intelligenza artificiale: alcuni dati minimizzati verranno inviati al fornitore AI (OpenAI) per generare i suggerimenti. Posso cambiare idea in qualsiasi momento dalle impostazioni.
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

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>oppure</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <TouchableOpacity
              style={[styles.socialButton, { borderColor: colors.border }]}
              onPress={() => handleSocialLogin('google')}
              disabled={isSubmitting || !!socialSubmitting}
              activeOpacity={0.8}
              testID="google-login-button"
            >
              {socialSubmitting === 'google' ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#DB4437" />
                  <Text style={[styles.socialButtonText, { color: colors.text }]}>Continua con Google</Text>
                </>
              )}
            </TouchableOpacity>

            {appleAvailable && (
              <TouchableOpacity
                style={[styles.socialButton, styles.appleButton]}
                onPress={() => handleSocialLogin('apple')}
                disabled={isSubmitting || !!socialSubmitting}
                activeOpacity={0.8}
                testID="apple-login-button"
              >
                {socialSubmitting === 'apple' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={22} color="#fff" />
                    <Text style={[styles.socialButtonText, { color: '#fff' }]}>Continua con Apple</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

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
  logoImage: {
    width: 88,
    height: 88,
    borderRadius: 24,
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
    minWidth: 0,
    width: '100%',
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
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 14,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  dividerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginTop: 20,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  socialButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  appleButton: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  socialButtonText: {
    fontSize: 16,
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
  ageSection: {
    marginBottom: 12,
    marginTop: 2,
  },
  ageLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginBottom: 8,
  },
  ageRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  ageOption: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  ageOptionSelected: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  ageOptionText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  ageWarning: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#E74C3C',
    lineHeight: 18,
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
