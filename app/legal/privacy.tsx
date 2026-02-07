import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";

const LAST_UPDATED = "7 febbraio 2026";

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
        <Pressable onPress={() => router.back()} hitSlop={12}>
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
          <P colors={colors}>Il titolare del trattamento dei dati personali e FamilySync Team.</P>
          <P colors={colors}>Per qualsiasi domanda o richiesta relativa alla privacy, puoi contattarci all'indirizzo email: support@familysync.app</P>
        </Section>

        <Section title="2. Dati Raccolti" colors={colors}>
          <P colors={colors}>FamilySync raccoglie e tratta i seguenti dati personali:</P>
          <Bullet colors={colors}>Dati di account: nome, indirizzo email e password (conservata in forma crittografata)</Bullet>
          <Bullet colors={colors}>Dati familiari: nomi dei membri della famiglia, ruoli all'interno del gruppo familiare</Bullet>
          <Bullet colors={colors}>Eventi calendario: titoli, date, orari, luoghi e descrizioni degli eventi condivisi</Bullet>
          <Bullet colors={colors}>Liste della spesa: nomi delle liste e articoli inseriti</Bullet>
          <Bullet colors={colors}>Faccende domestiche: attivita assegnate, stato di completamento, punti accumulati</Bullet>
          <Bullet colors={colors}>Dati tecnici: informazioni sul dispositivo, log di accesso, token di sessione</Bullet>
        </Section>

        <Section title="3. Finalita del Trattamento" colors={colors}>
          <Bullet colors={colors}>Erogazione del servizio: consentire la sincronizzazione familiare, la gestione di eventi, liste della spesa e faccende</Bullet>
          <Bullet colors={colors}>Comunicazioni di servizio: invio di email di verifica account, notifiche di reset password</Bullet>
          <Bullet colors={colors}>Suggerimenti intelligenti: generazione di consigli personalizzati tramite intelligenza artificiale (funzionalita opzionale)</Bullet>
          <Bullet colors={colors}>Miglioramento del servizio: analisi aggregate per migliorare le funzionalita dell'applicazione</Bullet>
          <Bullet colors={colors}>Supporto tecnico: assistenza nella risoluzione di problemi segnalati</Bullet>
        </Section>

        <Section title="4. Condivisione con Terze Parti" colors={colors}>
          <Bullet colors={colors}>Provider di hosting e database: i dati sono archiviati su server sicuri gestiti da provider cloud affidabili</Bullet>
          <Bullet colors={colors}>Servizio email: per l'invio di email transazionali (verifica account, reset password)</Bullet>
          <Bullet colors={colors}>OpenAI: per la generazione di suggerimenti AI (solo dati aggregati e anonimizzati)</Bullet>
          <Bullet colors={colors}>Stripe: per l'elaborazione dei pagamenti. Nota: il servizio di pagamento non e attualmente attivo</Bullet>
          <P colors={colors}>Non vendiamo, affittiamo o condividiamo i tuoi dati personali con terze parti per finalita di marketing.</P>
        </Section>

        <Section title="5. Conservazione dei Dati" colors={colors}>
          <Bullet colors={colors}>I dati dell'account vengono conservati fino alla cancellazione dell'account da parte dell'utente</Bullet>
          <Bullet colors={colors}>I dati familiari condivisi vengono conservati finche la famiglia rimane attiva</Bullet>
          <Bullet colors={colors}>I log di accesso vengono conservati per un massimo di 12 mesi</Bullet>
          <Bullet colors={colors}>I token di sessione scadono automaticamente dopo 7 giorni di inattivita</Bullet>
        </Section>

        <Section title="6. Sicurezza" colors={colors}>
          <Bullet colors={colors}>Crittografia delle password con algoritmo bcrypt</Bullet>
          <Bullet colors={colors}>Comunicazioni protette tramite protocollo HTTPS/TLS</Bullet>
          <Bullet colors={colors}>Autenticazione basata su token JWT con scadenza temporale</Bullet>
          <Bullet colors={colors}>Rate limiting per prevenire abusi delle API</Bullet>
          <Bullet colors={colors}>Headers di sicurezza HTTP</Bullet>
        </Section>

        <Section title="7. Diritti dell'Utente" colors={colors}>
          <P colors={colors}>In conformita con la normativa vigente (incluso il GDPR), hai il diritto di:</P>
          <Bullet colors={colors}>Accesso: richiedere una copia dei tuoi dati personali</Bullet>
          <Bullet colors={colors}>Rettifica: correggere dati inesatti o incompleti</Bullet>
          <Bullet colors={colors}>Cancellazione: richiedere la cancellazione dei tuoi dati personali</Bullet>
          <Bullet colors={colors}>Portabilita: ricevere i tuoi dati in formato strutturato e leggibile</Bullet>
          <Bullet colors={colors}>Opposizione: opporti al trattamento dei tuoi dati in determinate circostanze</Bullet>
          <P colors={colors}>Per esercitare questi diritti, contattaci all'indirizzo support@familysync.app</P>
        </Section>

        <Section title="8. Minori" colors={colors}>
          <P colors={colors}>FamilySync e un'applicazione per il coordinamento familiare. L'utilizzo dell'app da parte di minori di 14 anni e consentito esclusivamente sotto la supervisione e con il consenso di un genitore o tutore legale.</P>
          <P colors={colors}>Non raccogliamo consapevolmente dati personali di minori di 14 anni senza il consenso verificabile di un genitore o tutore.</P>
        </Section>

        <Section title="9. Modifiche" colors={colors}>
          <P colors={colors}>Ci riserviamo il diritto di aggiornare questa Privacy Policy in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email.</P>
        </Section>

        <Section title="10. Contatti" colors={colors}>
          <P colors={colors}>Per qualsiasi domanda relativa a questa Privacy Policy: support@familysync.app</P>
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
