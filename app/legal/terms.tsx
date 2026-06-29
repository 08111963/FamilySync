import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";

const LAST_UPDATED = "29 giugno 2026";

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
          <Bullet colors={colors}>Tenere traccia delle bollette e delle scadenze domestiche, con possibilita di allegare documenti</Bullet>
          <Bullet colors={colors}>Pianificare ricette e menu settimanali</Bullet>
          <Bullet colors={colors}>Comunicare tramite una chat interna con messaggi, immagini e allegati</Bullet>
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

        <Section title="5. Responsabilita dei Contenuti (UGC)" colors={colors}>
          <P colors={colors}>L'utente e l'unico responsabile dei contenuti inseriti nell'applicazione (UGC), inclusi nomi ed eventi, articoli nelle liste della spesa, descrizioni delle faccende, messaggi e allegati della chat, bollette e documenti, ricette e piani pasti, e informazioni del profilo.</P>
          <P colors={colors}>I contenuti non devono essere illegali, offensivi, diffamatori o in violazione dei diritti di terzi.</P>
          <P colors={colors}>Licenza limitata sui contenuti: l'utente mantiene la piena titolarita dei propri contenuti. Caricandoli, concede a FamilySync una licenza limitata, non esclusiva, gratuita e revocabile, valida solo per la durata dell'utilizzo del servizio e al solo scopo di erogare le funzionalita dell'app (archiviazione, sincronizzazione e condivisione con i membri della famiglia). La licenza cessa con la rimozione dei contenuti o l'eliminazione dell'account, salvo i contenuti gia condivisi con altri membri o gli obblighi di legge.</P>
        </Section>

        <Section title="6. Chat e Allegati" colors={colors}>
          <Bullet colors={colors}>I messaggi e gli allegati della chat sono visibili a tutti i membri del gruppo familiare</Bullet>
          <Bullet colors={colors}>L'utente e responsabile dei contenuti che invia e non deve caricare materiale illegale o in violazione di diritti altrui</Bullet>
          <Bullet colors={colors}>Gli allegati sono soggetti a limiti di dimensione e di tipo di file (immagini e documenti, con un limite massimo per file)</Bullet>
          <Bullet colors={colors}>I messaggi degli utenti bloccati non vengono mostrati al membro che ha effettuato il blocco</Bullet>
          <Bullet colors={colors}>I file allegati vengono rimossi quando la famiglia o l'account vengono eliminati</Bullet>
        </Section>

        <Section title="7. Gestione Bollette e Scadenze" colors={colors}>
          <Bullet colors={colors}>FamilySync NON elabora pagamenti reali: la funzione bollette ha finalita esclusivamente organizzativa e di promemoria</Bullet>
          <Bullet colors={colors}>L'app non richiede e non deve essere usata per inserire dati di pagamento sensibili come numeri di carta, codici CVV, coordinate bancarie o IBAN</Bullet>
          <Bullet colors={colors}>Gli importi e le scadenze sono annotazioni dell'utente: FamilySync non ne garantisce l'esattezza e non e responsabile di mancati pagamenti o more</Bullet>
          <Bullet colors={colors}>L'utente resta l'unico responsabile del pagamento delle proprie bollette presso i rispettivi fornitori</Bullet>
        </Section>

        <Section title="8. Funzionalita di Intelligenza Artificiale" colors={colors}>
          <Bullet colors={colors}>Le funzionalita AI sono facoltative e attivate solo previo consenso, modificabile in qualsiasi momento dalle impostazioni</Bullet>
          <Bullet colors={colors}>Per fornire i suggerimenti, alcuni dati pertinenti possono essere inviati a fornitori terzi di servizi AI; non vengono inviati piu dati del necessario</Bullet>
          <Bullet colors={colors}>I contenuti generati dall'AI hanno natura indicativa e possono essere imprecisi o incompleti; non costituiscono consigli professionali</Bullet>
          <Bullet colors={colors}>L'utente valuta in autonomia i suggerimenti: FamilySync non e responsabile delle decisioni assunte sulla base dei contenuti AI</Bullet>
          <Bullet colors={colors}>L'uso dell'AI puo essere soggetto a limiti di utilizzo (quota) differenziati tra piano Free e Premium</Bullet>
        </Section>

        <Section title="9. Segnalazione e Moderazione" colors={colors}>
          <Bullet colors={colors}>Ogni membro puo segnalare contenuti (eventi, spesa, faccende, messaggi chat) o utenti inappropriati</Bullet>
          <Bullet colors={colors}>Le segnalazioni vengono esaminate dagli amministratori del gruppo familiare</Bullet>
          <Bullet colors={colors}>Ogni membro puo bloccare un altro membro: i contenuti dell'utente bloccato non saranno piu visibili</Bullet>
          <Bullet colors={colors}>E possibile sbloccare un utente in qualsiasi momento dalle impostazioni</Bullet>
        </Section>

        <Section title="10. Uso Corretto" colors={colors}>
          <Bullet colors={colors}>Utilizzare l'applicazione esclusivamente per le finalita previste di coordinamento familiare</Bullet>
          <Bullet colors={colors}>Non tentare di accedere ad account o dati di altri utenti senza autorizzazione</Bullet>
          <Bullet colors={colors}>Non utilizzare sistemi automatizzati per interagire con il servizio</Bullet>
          <Bullet colors={colors}>Non tentare di compromettere la sicurezza o la stabilita dell'applicazione</Bullet>
          <Bullet colors={colors}>Rispettare le leggi applicabili durante l'utilizzo del servizio</Bullet>
        </Section>

        <Section title="11. Divieti" colors={colors}>
          <Bullet colors={colors}>Creare account falsi o multipli per finalita abusive</Bullet>
          <Bullet colors={colors}>Utilizzare il servizio per attivita commerciali non autorizzate</Bullet>
          <Bullet colors={colors}>Distribuire malware o contenuti dannosi attraverso l'applicazione</Bullet>
          <Bullet colors={colors}>Tentare di effettuare ingegneria inversa del software</Bullet>
          <Bullet colors={colors}>Interferire con il funzionamento dell'applicazione o dei suoi server</Bullet>
        </Section>

        <Section title="12. Piani Free e Premium e Abbonamenti" colors={colors}>
          <P colors={colors}>FamilySync e disponibile in un piano Free gratuito e in un piano Premium a pagamento.</P>
          <Bullet colors={colors}>Piano Free: funzionalita di base con alcuni limiti (ad esempio quota delle funzionalita AI)</Bullet>
          <Bullet colors={colors}>Piano Premium: funzionalita aggiuntive e limiti piu ampi; prezzi e durata sono indicati nell'app al momento dell'acquisto</Bullet>
          <Bullet colors={colors}>Gli abbonamenti su mobile sono gestiti tramite gli store ufficiali, Apple App Store (StoreKit) su iOS e Google Play Billing su Android, con il supporto tecnico di RevenueCat</Bullet>
          <Bullet colors={colors}>Addebito, rinnovo automatico e cancellazione avvengono tramite l'account dello store; la disinstallazione dell'app non annulla l'abbonamento</Bullet>
          <Bullet colors={colors}>I rimborsi sono soggetti alle politiche dello store (Apple o Google)</Bullet>
          <Bullet colors={colors}>Stripe NON viene utilizzato per attivare o gestire il Premium sulle app mobili</Bullet>
        </Section>

        <Section title="13. Sospensione e Chiusura Account" colors={colors}>
          <P colors={colors}>Ci riserviamo il diritto di sospendere temporaneamente o chiudere definitivamente un account in caso di violazione dei presenti Termini, rimuovere contenuti che violino le nostre politiche, e interrompere il servizio con un preavviso ragionevole.</P>
          <P colors={colors}>L'utente puo eliminare il proprio account in qualsiasi momento direttamente dall'app (scheda Famiglia → Elimina account), anche se l'email non e ancora verificata, oppure contattandoci all'indirizzo assistenza@familysync.it. L'eliminazione e definitiva: comporta l'anonimizzazione del profilo e, se l'utente e l'unico membro di una famiglia, la cancellazione della famiglia e dei relativi contenuti, inclusi i file fisici allegati (immagini della chat, documenti delle bollette e avatar). I contenuti gia condivisi con una famiglia che continua a esistere possono restare visibili in forma anonima. L'eliminazione dell'account non annulla eventuali abbonamenti Premium, che vanno gestiti separatamente dallo store (Apple o Google).</P>
        </Section>

        <Section title="14. Limitazioni di Responsabilita" colors={colors}>
          <P colors={colors}>Nei limiti consentiti dalla legge applicabile:</P>
          <Bullet colors={colors}>Il servizio viene fornito "cosi com'e" e "come disponibile" senza garanzie di alcun tipo</Bullet>
          <Bullet colors={colors}>Non garantiamo che il servizio sia sempre disponibile, privo di errori o sicuro al 100%</Bullet>
          <Bullet colors={colors}>Non siamo responsabili per eventuali perdite di dati dovute a malfunzionamenti tecnici, salvo dolo o colpa grave</Bullet>
          <Bullet colors={colors}>La nostra responsabilita massima e limitata all'importo pagato dall'utente nei 12 mesi precedenti</Bullet>
          <P colors={colors}>Nessuna disposizione esclude o limita la responsabilita nei casi non consentiti dalla legge, inclusi i diritti inderogabili dei consumatori.</P>
        </Section>

        <Section title="15. Proprieta Intellettuale" colors={colors}>
          <P colors={colors}>Tutti i diritti di proprieta intellettuale relativi a FamilySync, inclusi design, codice, marchi e contenuti originali, sono di proprieta esclusiva di Marino Pizzuti / FamilySync. Restano salvi i diritti dell'utente sui propri contenuti (UGC) e la licenza limitata descritta alla sezione 5.</P>
        </Section>

        <Section title="16. Legge Applicabile" colors={colors}>
          <P colors={colors}>I presenti Termini d'Uso sono regolati dalla legge italiana. Per qualsiasi controversia sara competente il Foro del luogo di residenza del consumatore, in conformita con il Codice del Consumo italiano.</P>
        </Section>

        <Section title="17. Modifiche ai Termini" colors={colors}>
          <P colors={colors}>Ci riserviamo il diritto di modificare i presenti Termini d'Uso in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email. L'uso continuato del servizio dopo la pubblicazione delle modifiche costituisce accettazione dei nuovi Termini.</P>
        </Section>

        <Section title="18. Contatti" colors={colors}>
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
