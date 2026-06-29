import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";

const LAST_UPDATED = "7 febbraio 2026";

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const openInBrowser = () => {
    const url = `${getApiUrl()}/legal/terms`;
    Linking.openURL(url);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Termini d'Uso</Text>
        <Pressable onPress={openInBrowser} hitSlop={12}>
          <Ionicons name="open-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title="1. Accettazione dei Termini" colors={colors}>
          <P colors={colors}>Utilizzando FamilySync, accetti di essere vincolato dai presenti Termini d'Uso. Se non accetti questi termini, ti preghiamo di non utilizzare l'applicazione.</P>
        </Section>

        <Section title="2. Descrizione del Servizio" colors={colors}>
          <P colors={colors}>FamilySync e un'applicazione per il coordinamento familiare che consente ai membri di una famiglia di:</P>
          <Bullet colors={colors}>Gestire un calendario condiviso</Bullet>
          <Bullet colors={colors}>Creare e condividere liste della spesa</Bullet>
          <Bullet colors={colors}>Organizzare e assegnare faccende domestiche con un sistema di punti</Bullet>
          <Bullet colors={colors}>Ricevere suggerimenti intelligenti basati sull'intelligenza artificiale</Bullet>
          <Bullet colors={colors}>Sincronizzare le informazioni in tempo reale tra tutti i dispositivi</Bullet>
        </Section>

        <Section title="3. Account e Registrazione" colors={colors}>
          <Bullet colors={colors}>Per utilizzare FamilySync e necessario creare un account fornendo un indirizzo email valido, un nome e una password</Bullet>
          <Bullet colors={colors}>Sei responsabile della riservatezza delle tue credenziali di accesso</Bullet>
          <Bullet colors={colors}>Devi avere almeno 14 anni per creare un account. I minori di 14 anni possono utilizzare l'app solo sotto la supervisione di un genitore/tutore</Bullet>
          <Bullet colors={colors}>Le informazioni fornite durante la registrazione devono essere accurate e aggiornate</Bullet>
        </Section>

        <Section title="4. Gruppi Familiari" colors={colors}>
          <Bullet colors={colors}>L'utente che crea un gruppo familiare ne diventa automaticamente l'amministratore</Bullet>
          <Bullet colors={colors}>Gli amministratori possono invitare nuovi membri, rimuovere membri esistenti e gestire le impostazioni del gruppo</Bullet>
          <Bullet colors={colors}>I contenuti inseriti all'interno di un gruppo familiare sono visibili a tutti i membri del gruppo</Bullet>
          <Bullet colors={colors}>L'uscita da un gruppo familiare non comporta la cancellazione dei contenuti precedentemente condivisi</Bullet>
        </Section>

        <Section title="5. Responsabilita dei Contenuti" colors={colors}>
          <P colors={colors}>L'utente e l'unico responsabile dei contenuti inseriti nell'applicazione, inclusi nomi degli eventi, articoli nelle liste della spesa, descrizioni delle faccende domestiche e informazioni del profilo.</P>
          <P colors={colors}>I contenuti non devono essere illegali, offensivi, diffamatori o in violazione dei diritti di terzi.</P>
        </Section>

        <Section title="6. Uso Corretto" colors={colors}>
          <Bullet colors={colors}>Utilizzare l'applicazione esclusivamente per le finalita previste di coordinamento familiare</Bullet>
          <Bullet colors={colors}>Non tentare di accedere ad account o dati di altri utenti senza autorizzazione</Bullet>
          <Bullet colors={colors}>Non utilizzare sistemi automatizzati per interagire con il servizio</Bullet>
          <Bullet colors={colors}>Non tentare di compromettere la sicurezza o la stabilita dell'applicazione</Bullet>
          <Bullet colors={colors}>Rispettare le leggi applicabili durante l'utilizzo del servizio</Bullet>
        </Section>

        <Section title="7. Divieti" colors={colors}>
          <Bullet colors={colors}>Creare account falsi o multipli per finalita abusive</Bullet>
          <Bullet colors={colors}>Utilizzare il servizio per attivita commerciali non autorizzate</Bullet>
          <Bullet colors={colors}>Distribuire malware o contenuti dannosi attraverso l'applicazione</Bullet>
          <Bullet colors={colors}>Tentare di effettuare ingegneria inversa del software</Bullet>
          <Bullet colors={colors}>Interferire con il funzionamento dell'applicazione o dei suoi server</Bullet>
        </Section>

        <Section title="8. Sospensione e Chiusura Account" colors={colors}>
          <P colors={colors}>Ci riserviamo il diritto di sospendere temporaneamente o chiudere definitivamente un account in caso di violazione dei presenti Termini, rimuovere contenuti che violino le nostre politiche, e interrompere il servizio con un preavviso ragionevole.</P>
          <P colors={colors}>L'utente puo eliminare il proprio account in qualsiasi momento direttamente dall'app (scheda Famiglia → Elimina account) oppure contattandoci all'indirizzo assistenza@familysync.it. L'eliminazione e definitiva: comporta l'anonimizzazione del profilo e, se l'utente e l'unico membro di una famiglia, la cancellazione della famiglia e dei relativi contenuti. I contenuti gia condivisi con altri membri possono restare visibili in forma anonima. L'eliminazione dell'account non annulla eventuali abbonamenti Premium, che vanno gestiti separatamente dallo store (Apple o Google).</P>
        </Section>

        <Section title="9. Abbonamenti Premium" colors={colors}>
          <P colors={colors}>FamilySync offre funzionalita premium a pagamento. I dettagli specifici relativi a prezzi, modalita di pagamento e politica di rimborso verranno comunicati al momento dell'attivazione del servizio. L'utilizzo delle funzionalita base rimane gratuito.</P>
        </Section>

        <Section title="10. Limitazioni di Responsabilita" colors={colors}>
          <Bullet colors={colors}>Il servizio viene fornito "cosi com'e" senza garanzie di alcun tipo</Bullet>
          <Bullet colors={colors}>Non garantiamo che il servizio sia sempre disponibile, privo di errori o sicuro al 100%</Bullet>
          <Bullet colors={colors}>Non siamo responsabili per eventuali perdite di dati dovute a malfunzionamenti tecnici, salvo dolo o colpa grave</Bullet>
          <Bullet colors={colors}>La nostra responsabilita massima e limitata all'importo pagato dall'utente nei 12 mesi precedenti</Bullet>
        </Section>

        <Section title="11. Legge Applicabile" colors={colors}>
          <P colors={colors}>I presenti Termini d'Uso sono regolati dalla legge italiana. Per qualsiasi controversia sara competente il Foro del luogo di residenza del consumatore, in conformita con il Codice del Consumo italiano.</P>
        </Section>

        <Section title="12. Modifiche ai Termini" colors={colors}>
          <P colors={colors}>Ci riserviamo il diritto di modificare i presenti Termini d'Uso in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email. L'uso continuato del servizio dopo la pubblicazione delle modifiche costituisce accettazione dei nuovi Termini.</P>
        </Section>

        <Section title="13. Contatti" colors={colors}>
          <P colors={colors}>Per qualsiasi domanda o segnalazione: assistenza@familysync.it</P>
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
