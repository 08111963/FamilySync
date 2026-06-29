import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";

const LAST_UPDATED = "29 giugno 2026";

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const openInBrowser = () => {
    const url = `${getApiUrl()}/legal/privacy`;
    Linking.openURL(url);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy Policy</Text>
        <Pressable onPress={openInBrowser} hitSlop={12}>
          <Ionicons name="open-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title="1. Titolare del Trattamento" colors={colors}>
          <P colors={colors}>Il titolare del trattamento dei dati personali e Marino Pizzuti / FamilySync.</P>
          <P colors={colors}>Per qualsiasi domanda relativa alla privacy, all'esercizio dei tuoi diritti o al supporto, puoi contattarci all'unico indirizzo email: assistenza@familysync.it</P>
          <P colors={colors}>Sito di riferimento: https://familysync.eu</P>
        </Section>

        <Section title="2. Dati Raccolti" colors={colors}>
          <P colors={colors}>FamilySync raccoglie e tratta le seguenti categorie di dati personali, in base alle funzioni che utilizzi:</P>
          <Bullet colors={colors}>Dati di account: nome, indirizzo email e password (conservata in forma crittografata con hashing, mai in chiaro)</Bullet>
          <Bullet colors={colors}>Verifica e sicurezza account: token di verifica email (a scadenza temporale) e token di reset password (conservati in forma hashata), stato di verifica</Bullet>
          <Bullet colors={colors}>Dati familiari: nomi dei membri, ruoli nel gruppo, inviti familiari e relativi token di invito (conservati in forma hashata)</Bullet>
          <Bullet colors={colors}>Eventi calendario: titoli, date, orari, luoghi e descrizioni degli eventi condivisi</Bullet>
          <Bullet colors={colors}>Liste della spesa: nomi delle liste, articoli inseriti e relativo storico</Bullet>
          <Bullet colors={colors}>Faccende domestiche: attivita assegnate, stato di completamento, punti accumulati</Bullet>
          <Bullet colors={colors}>Chat e messaggi: contenuti dei messaggi tra i membri ed eventuali file/immagini allegati</Bullet>
          <Bullet colors={colors}>Allegati caricati dagli utenti: immagini e documenti caricati nell'app (chat o bollette)</Bullet>
          <Bullet colors={colors}>Bollette e scadenze: titoli, categorie, importi, scadenze, fornitori, intestatari, responsabili, note, ricevute e allegati</Bullet>
          <Bullet colors={colors}>Ripartizioni e pagamenti: suddivisione degli importi tra i membri e storico dei pagamenti registrati manualmente</Bullet>
          <Bullet colors={colors}>Notifiche: preferenze di notifica e, se attive le notifiche push, il token push del dispositivo</Bullet>
          <Bullet colors={colors}>Dati tecnici: informazioni sul dispositivo, log di accesso e di sistema, indirizzo IP (se raccolto dai log), token di sessione</Bullet>
        </Section>

        <Section title="3. Bollette e Scadenze" colors={colors}>
          <P colors={colors}>FamilySync consente di registrare bollette e scadenze domestiche, inclusi importi, scadenze, fornitori, intestatari, note, allegati e ricevute, oltre alla ripartizione delle spese tra i membri e allo storico dei pagamenti.</P>
          <P colors={colors}>Importante: l'app NON effettua pagamenti reali, NON elabora transazioni verso terzi, NON salva carte di credito, NON salva codici CVV e NON salva coordinate bancarie (IBAN). Lo stato "pagato" e gli importi sono registrazioni inserite manualmente a scopo organizzativo.</P>
        </Section>

        <Section title="4. Finalita del Trattamento" colors={colors}>
          <Bullet colors={colors}>Erogazione del servizio: sincronizzazione familiare, gestione di calendario, liste, faccende, chat, bollette e scadenze</Bullet>
          <Bullet colors={colors}>Comunicazioni di servizio: email di verifica account, reset password, inviti familiari e comunicazioni essenziali</Bullet>
          <Bullet colors={colors}>Notifiche: promemoria locali (es. scadenze bollette) ed eventuali notifiche push remote</Bullet>
          <Bullet colors={colors}>Suggerimenti intelligenti: generazione di consigli tramite intelligenza artificiale (funzionalita opzionale)</Bullet>
          <Bullet colors={colors}>Miglioramento del servizio: analisi aggregate per migliorare le funzionalita dell'applicazione</Bullet>
          <Bullet colors={colors}>Supporto tecnico e sicurezza: assistenza, prevenzione abusi e protezione degli account</Bullet>
        </Section>

        <Section title="5. Email Transazionali" colors={colors}>
          <P colors={colors}>FamilySync invia email transazionali tramite il fornitore Resend per: verifica dell'account, inviti familiari, reset della password e comunicazioni essenziali.</P>
          <P colors={colors}>Le email non contengono mai la password. I link di verifica e reset hanno una durata limitata nel tempo (vedi Conservazione dei Dati).</P>
        </Section>

        <Section title="6. Funzionalita di Intelligenza Artificiale (AI)" colors={colors}>
          <P colors={colors}>Le funzioni AI sono opzionali, basate sul fornitore OpenAI, soggette al tuo consenso e gestite tramite impostazioni e limiti di utilizzo (quote). Possono essere attivate o disattivate in qualsiasi momento.</P>
          <P colors={colors}>I dati inviati a OpenAI sono minimizzati. NON vengono inviati: password, indirizzi email, dati di pagamento, allegati, ricevute, contenuti delle chat, indirizzi fisici o numeri di telefono.</P>
          <P colors={colors}>I dati inviati tramite l'API di OpenAI non vengono usati per addestrare i modelli, salvo diversa configurazione o opt-in esplicito. Base giuridica: consenso esplicito, revocabile in qualsiasi momento.</P>
        </Section>

        <Section title="7. Pagamenti e Abbonamenti Premium" colors={colors}>
          <P colors={colors}>Gli abbonamenti Premium nell'app mobile sono gestiti tramite gli acquisti in-app degli store, con gestione di abbonamenti ed entitlements affidata a RevenueCat:</P>
          <Bullet colors={colors}>Apple In-App Purchase / StoreKit su iOS</Bullet>
          <Bullet colors={colors}>Google Play Billing su Android</Bullet>
          <Bullet colors={colors}>RevenueCat per abbonamenti, stato dell'abbonamento ed entitlements</Bullet>
          <P colors={colors}>Stripe non e utilizzato per la vendita di Premium nell'app mobile. I dati delle carte sono trattati direttamente da Apple o Google; FamilySync non ha accesso ai dati completi della tua carta.</P>
        </Section>

        <Section title="8. Notifiche" colors={colors}>
          <Bullet colors={colors}>Notifiche locali: programmate sul dispositivo (es. promemoria scadenze bollette); non inviano i contenuti a server esterni</Bullet>
          <Bullet colors={colors}>Notifiche push remote: se attivate, possono usare un token push e i servizi di notifica di Expo/Apple/Google</Bullet>
        </Section>

        <Section title="9. Condivisione con Terze Parti e Fornitori" colors={colors}>
          <Bullet colors={colors}>Replit: hosting e deploy dell'applicazione e del backend</Bullet>
          <Bullet colors={colors}>Neon / PostgreSQL: database in cui sono archiviati i dati</Bullet>
          <Bullet colors={colors}>Resend: invio di email transazionali</Bullet>
          <Bullet colors={colors}>OpenAI: generazione di suggerimenti AI (solo dati minimizzati, funzione opzionale)</Bullet>
          <Bullet colors={colors}>RevenueCat, Apple, Google: gestione di abbonamenti e acquisti in-app</Bullet>
          <Bullet colors={colors}>Servizi di notifica push (Expo/Apple/Google): recapito delle notifiche push, se attive</Bullet>
          <P colors={colors}>Non vendiamo, affittiamo o condividiamo i tuoi dati personali con terze parti per finalita di marketing.</P>
        </Section>

        <Section title="10. Trasferimenti Extra-UE" colors={colors}>
          <P colors={colors}>Alcuni fornitori (es. OpenAI, Resend, RevenueCat, Apple, Google, Replit) possono trattare i dati su infrastrutture fuori dallo Spazio Economico Europeo (SEE). In tali casi i trasferimenti avvengono con garanzie adeguate ove applicabile (es. Clausole Contrattuali Standard della Commissione Europea o meccanismi equivalenti).</P>
        </Section>

        <Section title="11. Conservazione dei Dati" colors={colors}>
          <Bullet colors={colors}>I dati dell'account sono conservati fino alla cancellazione dell'account</Bullet>
          <Bullet colors={colors}>I dati familiari (calendario, liste, faccende, chat, bollette, allegati, ricevute) sono conservati fino alla cancellazione della famiglia o dell'account</Bullet>
          <Bullet colors={colors}>I token di reset password scadono dopo 1 ora</Bullet>
          <Bullet colors={colors}>I token di verifica email scadono dopo 6 ore</Bullet>
          <Bullet colors={colors}>I token di invito familiare scadono dopo 72 ore; gli inviti scaduti o usati non sono piu validi</Bullet>
          <Bullet colors={colors}>Le sessioni / refresh token scadono dopo 7 giorni</Bullet>
          <Bullet colors={colors}>I log di sistema sono conservati per il tempo necessario, fino a un massimo di 12 mesi</Bullet>
        </Section>

        <Section title="12. Sicurezza" colors={colors}>
          <Bullet colors={colors}>Crittografia delle password con algoritmo bcrypt</Bullet>
          <Bullet colors={colors}>Comunicazioni protette tramite protocollo HTTPS/TLS</Bullet>
          <Bullet colors={colors}>Autenticazione basata su token JWT con scadenza temporale</Bullet>
          <Bullet colors={colors}>Rate limiting per prevenire abusi delle API</Bullet>
          <Bullet colors={colors}>Headers di sicurezza HTTP</Bullet>
        </Section>

        <Section title="13. Diritti dell'Utente" colors={colors}>
          <P colors={colors}>In conformita con la normativa vigente (incluso il GDPR), hai il diritto di:</P>
          <Bullet colors={colors}>Accesso: richiedere una copia dei tuoi dati personali</Bullet>
          <Bullet colors={colors}>Rettifica: correggere dati inesatti o incompleti</Bullet>
          <Bullet colors={colors}>Cancellazione: richiedere la cancellazione dei tuoi dati</Bullet>
          <Bullet colors={colors}>Portabilita: ricevere i tuoi dati in formato strutturato e leggibile</Bullet>
          <Bullet colors={colors}>Opposizione: opporti al trattamento in determinate circostanze</Bullet>
          <Bullet colors={colors}>Limitazione: chiedere la limitazione del trattamento dei tuoi dati</Bullet>
          <Bullet colors={colors}>Revoca del consenso: revocare in qualsiasi momento i consensi prestati (es. per le funzioni AI)</Bullet>
          <Bullet colors={colors}>Reclamo: proporre reclamo al Garante per la protezione dei dati personali</Bullet>
          <P colors={colors}>Per esercitare questi diritti, scrivi a assistenza@familysync.it</P>
        </Section>

        <Section title="14. Cancellazione dell'Account" colors={colors}>
          <P colors={colors}>Puoi richiedere la cancellazione del tuo account e dei dati associati scrivendo a assistenza@familysync.it. Daremo seguito nei tempi previsti dalla normativa applicabile, salvo obblighi di legge che impongano una conservazione piu lunga.</P>
        </Section>

        <Section title="15. Minori" colors={colors}>
          <P colors={colors}>FamilySync e un'applicazione per il coordinamento familiare. L'utilizzo da parte di minori di 14 anni e consentito esclusivamente sotto la supervisione e con il consenso di un genitore o tutore legale che sia gia membro della famiglia.</P>
          <P colors={colors}>Non raccogliamo consapevolmente dati personali di minori di 14 anni senza il consenso verificabile di un genitore o tutore.</P>
        </Section>

        <Section title="16. Modifiche" colors={colors}>
          <P colors={colors}>Ci riserviamo il diritto di aggiornare questa Privacy Policy in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email.</P>
        </Section>

        <Section title="17. Contatti" colors={colors}>
          <P colors={colors}>Per qualsiasi domanda relativa a questa Privacy Policy: assistenza@familysync.it</P>
        </Section>

        <Text style={[styles.updateDate, { color: colors.textSecondary }]}>
          Ultimo aggiornamento: {LAST_UPDATED}
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children, colors }: { children: string; colors: any }) {
  return <Text style={[styles.paragraph, { color: colors.textSecondary }]}>{children}</Text>;
}

function Bullet({ children, colors }: { children: string; colors: any }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
      <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  updateDate: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
});
