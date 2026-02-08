import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";

const LAST_UPDATED = "8 febbraio 2026";

export default function UserGuideScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const openInBrowser = () => {
    const url = `${getApiUrl()}/help/user-guide`;
    Linking.openURL(url);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Guida Utente</Text>
        <Pressable onPress={openInBrowser} hitSlop={12}>
          <Ionicons name="open-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title="1. Primi Passi" colors={colors}>
          <SubSection title="Creare un Account" colors={colors} />
          <Bullet colors={colors}>Apri l'app e tocca Registrati</Bullet>
          <Bullet colors={colors}>Inserisci il tuo nome, indirizzo email e una password sicura</Bullet>
          <Bullet colors={colors}>Riceverai una email di verifica: clicca sul link per confermare il tuo account</Bullet>
          <Bullet colors={colors}>Dopo la verifica, effettua il login con le tue credenziali</Bullet>

          <SubSection title="Creare una Famiglia" colors={colors} />
          <Bullet colors={colors}>Dalla schermata Home, inserisci il nome della tua famiglia</Bullet>
          <Bullet colors={colors}>Tocca il pulsante per creare la famiglia</Bullet>
          <Bullet colors={colors}>Diventerai automaticamente l'amministratore del gruppo</Bullet>

          <SubSection title="Invitare Membri" colors={colors} />
          <Bullet colors={colors}>Vai alla scheda Famiglia e tocca il pulsante per aggiungere un membro</Bullet>
          <Bullet colors={colors}>Inserisci l'indirizzo email della persona da invitare</Bullet>
          <Bullet colors={colors}>Il familiare ricevera un link di invito per unirsi al gruppo</Bullet>
        </Section>

        <Section title="2. Home" colors={colors}>
          <P colors={colors}>La schermata Home e il centro di comando della tua famiglia:</P>
          <Bullet colors={colors}>Prossimi Eventi: i 3 eventi in arrivo dal calendario condiviso</Bullet>
          <Bullet colors={colors}>Faccende da Fare: le 3 faccende piu urgenti da completare</Bullet>
          <Bullet colors={colors}>Classifica Punti: i primi 3 membri per punti accumulati</Bullet>
        </Section>

        <Section title="3. Calendario Condiviso" colors={colors}>
          <SubSection title="Visualizzare gli Eventi" colors={colors} />
          <Bullet colors={colors}>Apri la scheda Calendario per vedere il mese corrente</Bullet>
          <Bullet colors={colors}>Tocca un giorno per vedere gli eventi di quella data</Bullet>
          <Bullet colors={colors}>Naviga tra i mesi usando le frecce in alto</Bullet>

          <SubSection title="Creare un Evento" colors={colors} />
          <P colors={colors}>Tocca il pulsante + nel calendario e compila:</P>
          <Bullet colors={colors}>Titolo, Data, Ora di inizio e fine</Bullet>
          <Bullet colors={colors}>Luogo e Descrizione (opzionali)</Bullet>
          <Bullet colors={colors}>Colore per identificare l'evento</Bullet>
          <Bullet colors={colors}>Tutto il giorno: attiva se l'evento dura l'intera giornata</Bullet>
        </Section>

        <Section title="4. Liste della Spesa" colors={colors}>
          <SubSection title="Creare e Gestire Liste" colors={colors} />
          <Bullet colors={colors}>Vai alla scheda Spesa e tocca + per creare una nuova lista</Bullet>
          <Bullet colors={colors}>Tocca una lista per aprirla e aggiungere articoli</Bullet>
          <Bullet colors={colors}>Specifica quantita, unita (pz, kg, L) e categoria</Bullet>
          <Bullet colors={colors}>Tocca un articolo per segnarlo come acquistato</Bullet>

          <SubSection title="Suggerimenti AI" colors={colors} />
          <P colors={colors}>Con le funzionalita AI attive, ricevi suggerimenti basati su:</P>
          <Bullet colors={colors}>Le abitudini di acquisto della famiglia</Bullet>
          <Bullet colors={colors}>Gli eventi in programma nel calendario</Bullet>
          <Bullet colors={colors}>La stagione corrente</Bullet>
          <P colors={colors}>I suggerimenti sono suddivisi per: Alimentari, Casa e Pulizia, Cura Personale.</P>
        </Section>

        <Section title="5. Faccende Domestiche" colors={colors}>
          <SubSection title="Creare una Faccenda" colors={colors} />
          <Bullet colors={colors}>Titolo e Descrizione della faccenda</Bullet>
          <Bullet colors={colors}>Difficolta: Facile, Media o Difficile</Bullet>
          <Bullet colors={colors}>Punti: scegli il valore (5, 10, 15, 20, 25, 50)</Bullet>
          <Bullet colors={colors}>Tempo stimato, Assegnata a, Scadenza (opzionali)</Bullet>
          <Bullet colors={colors}>Ricorrenza: Giornaliera, Settimanale o Mensile</Bullet>

          <SubSection title="Sistema di Punti" colors={colors} />
          <P colors={colors}>Ogni faccenda completata fa guadagnare punti al membro assegnato. Piu faccende completi, piu sali in classifica!</P>

          <SubSection title="Filtri" colors={colors} />
          <Bullet colors={colors}>Da fare: faccende in sospeso</Bullet>
          <Bullet colors={colors}>Completate: faccende gia fatte</Bullet>
          <Bullet colors={colors}>Tutte: mostra tutte le faccende</Bullet>
        </Section>

        <Section title="6. Gestione Famiglia" colors={colors}>
          <SubSection title="Ruoli" colors={colors} />
          <Bullet colors={colors}>Amministratore: gestisce membri, impostazioni, segnalazioni e inviti</Bullet>
          <Bullet colors={colors}>Membro: utilizza tutte le funzionalita di calendario, spesa e faccende</Bullet>

          <SubSection title="Gestione Membri" colors={colors} />
          <Bullet colors={colors}>Visualizza tutti i membri dalla scheda Famiglia</Bullet>
          <Bullet colors={colors}>L'amministratore puo modificare il nome della famiglia</Bullet>
          <Bullet colors={colors}>Solo gli amministratori possono rimuovere membri</Bullet>
        </Section>

        <Section title="7. Suggerimenti AI" colors={colors}>
          <SubSection title="Attivare/Disattivare" colors={colors} />
          <Bullet colors={colors}>Vai alla scheda Famiglia, sezione Funzionalita</Bullet>
          <Bullet colors={colors}>Usa il toggle per le Funzionalita AI</Bullet>
          <Bullet colors={colors}>L'AI e completamente opzionale e rispetta la tua privacy</Bullet>

          <SubSection title="Tipi di Suggerimenti" colors={colors} />
          <Bullet colors={colors}>Suggerimenti Spesa: articoli consigliati in base alle abitudini</Bullet>
          <Bullet colors={colors}>Ottimizzazione Faccende: distribuzione equa tra i membri</Bullet>
          <Bullet colors={colors}>Insights Familiari: statistiche e consigli settimanali</Bullet>

          <SubSection title="Privacy dei Dati AI" colors={colors} />
          <P colors={colors}>I dati inviati all'AI sono aggregati e anonimizzati. Niente email, password o dati sensibili viene condiviso. Puoi disattivare l'AI in qualsiasi momento.</P>
        </Section>

        <Section title="8. Sicurezza e Moderazione" colors={colors}>
          <SubSection title="Segnalare Contenuti" colors={colors} />
          <Bullet colors={colors}>Tocca l'opzione di segnalazione sull'elemento o profilo utente</Bullet>
          <Bullet colors={colors}>Categorie: Spam, Molestie, Odio, Contenuti Sessuali, Violenza, Altro</Bullet>
          <Bullet colors={colors}>La segnalazione verra esaminata dall'amministratore</Bullet>

          <SubSection title="Bloccare un Utente" colors={colors} />
          <Bullet colors={colors}>I contenuti degli utenti bloccati non saranno piu visibili</Bullet>
          <Bullet colors={colors}>La persona bloccata non viene notificata</Bullet>
          <Bullet colors={colors}>Puoi sbloccare un utente in qualsiasi momento</Bullet>
        </Section>

        <Section title="9. Impostazioni e Account" colors={colors}>
          <Bullet colors={colors}>Password protetta con crittografia avanzata</Bullet>
          <Bullet colors={colors}>Sessioni con scadenza automatica dopo 7 giorni</Bullet>
          <Bullet colors={colors}>Reset password disponibile dalla schermata di login</Bullet>
          <Bullet colors={colors}>Dalla scheda Famiglia puoi consultare Privacy Policy, Termini d'Uso e questa Guida</Bullet>
        </Section>

        <Section title="10. Sincronizzazione in Tempo Reale" colors={colors}>
          <Bullet colors={colors}>Tutti i dati si aggiornano istantaneamente tra i dispositivi</Bullet>
          <Bullet colors={colors}>Non serve aggiornare manualmente</Bullet>
          <Bullet colors={colors}>Se sei offline, i dati vengono sincronizzati al ripristino della connessione</Bullet>
          <P colors={colors}>Vengono sincronizzati: eventi calendario, articoli spesa, faccende e modifiche ai membri.</P>
        </Section>

        <Section title="11. Domande Frequenti" colors={colors}>
          <SubSection title="Quanti membri posso aggiungere?" colors={colors} />
          <P colors={colors}>Non c'e un limite al numero di membri che puoi invitare.</P>

          <SubSection title="I miei dati sono al sicuro?" colors={colors} />
          <P colors={colors}>Si. Utilizziamo crittografia avanzata, connessioni protette HTTPS e autenticazione con token.</P>

          <SubSection title="L'AI e obbligatoria?" colors={colors} />
          <P colors={colors}>No. Le funzionalita AI sono completamente opzionali e possono essere disattivate in qualsiasi momento.</P>

          <SubSection title="Come funziona il sistema di punti?" colors={colors} />
          <P colors={colors}>Ogni faccenda ha un valore in punti (da 5 a 50). Quando completi una faccenda, i punti vengono aggiunti al tuo punteggio.</P>

          <SubSection title="Posso usare FamilySync su piu dispositivi?" colors={colors} />
          <P colors={colors}>Si! FamilySync funziona su iPhone, Android e web con sincronizzazione in tempo reale.</P>

          <SubSection title="Come posso segnalare un problema?" colors={colors} />
          <P colors={colors}>Contattaci all'indirizzo support@familysync.app per qualsiasi problema o suggerimento.</P>
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

function SubSection({ title, colors }: { title: string; colors: any }) {
  return <Text style={[styles.subSectionTitle, { color: colors.text }]}>{title}</Text>;
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
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  subSectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginTop: 12,
    marginBottom: 6,
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
