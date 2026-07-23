import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";
import { PRIVACY_POLICY_VERSION, PRIVACY_POLICY_DATE } from "@/shared/policy-version";

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
        <Text style={[styles.versionBadge, { color: colors.text }]}>
          Versione {PRIVACY_POLICY_VERSION} — {PRIVACY_POLICY_DATE}
        </Text>

        <Section title="1. Titolare del Trattamento" colors={colors}>
          <P colors={colors}>Il titolare del trattamento dei dati personali è FamilySync.</P>
          <P colors={colors}>Per qualsiasi domanda relativa alla privacy, all'esercizio dei tuoi diritti o al supporto, puoi contattarci all'unico indirizzo email: assistenza@familysync.it</P>
          <P colors={colors}>Sito di riferimento: https://familysync.eu</P>
        </Section>

        <Section title="2. Dati Raccolti" colors={colors}>
          <P colors={colors}>FamilySync raccoglie e tratta le seguenti categorie di dati personali, in base alle funzioni che utilizzi:</P>
          <Bullet colors={colors}>Dati di account: nome, indirizzo email e password. La password non viene mai conservata in chiaro: viene salvata solo una sua rappresentazione irreversibile ottenuta con un algoritmo di hashing robusto, secondo le buone pratiche di settore</Bullet>
          <Bullet colors={colors}>Fascia di età (facoltativa): in fase di registrazione puoi indicare una fascia di età (14-17 anni oppure 18 anni o più). Non raccogliamo la data di nascita: questa informazione serve solo ad applicare le tutele previste per i minori</Bullet>
          <Bullet colors={colors}>Verifica e sicurezza account: token di verifica email (a scadenza temporale) e token di reset password (conservati in forma hashata), stato di verifica</Bullet>
          <Bullet colors={colors}>Registro dei consensi: data, tipo di consenso (es. Termini, funzioni AI), stato (prestato/revocato) e versione della policy in vigore al momento</Bullet>
          <Bullet colors={colors}>Dati familiari: nomi dei membri, ruoli nel gruppo, inviti familiari e relativi token di invito (conservati in forma hashata)</Bullet>
          <Bullet colors={colors}>Eventi calendario: titoli, date, orari, luoghi e descrizioni degli eventi condivisi</Bullet>
          <Bullet colors={colors}>Liste della spesa e dispensa: nomi delle liste, articoli inseriti e relativo storico</Bullet>
          <Bullet colors={colors}>Faccende domestiche: attività assegnate, stato di completamento, punti accumulati</Bullet>
          <Bullet colors={colors}>Ricette e piani pasti: ricette, ingredienti e pianificazioni settimanali</Bullet>
          <Bullet colors={colors}>Chat e messaggi: contenuti dei messaggi tra i membri ed eventuali file/immagini allegati</Bullet>
          <Bullet colors={colors}>Allegati caricati dagli utenti: immagini e documenti caricati nell'app (chat o bollette)</Bullet>
          <Bullet colors={colors}>Bollette, scadenze e budget: titoli, categorie, importi, scadenze, fornitori, intestatari, responsabili, note, ricevute, allegati e spese registrate manualmente</Bullet>
          <Bullet colors={colors}>Ripartizioni e pagamenti: suddivisione degli importi tra i membri e storico dei pagamenti registrati manualmente</Bullet>
          <Bullet colors={colors}>Registrazioni vocali (facoltative): se usi la dettatura vocale, l'audio viene inviato al fornitore AI per la sola trascrizione e non viene conservato sui nostri server</Bullet>
          <Bullet colors={colors}>Notifiche: preferenze di notifica e, se attive le notifiche push, il token push del dispositivo</Bullet>
          <Bullet colors={colors}>Dati tecnici: informazioni sul dispositivo, log di accesso e di sistema, indirizzo IP (se raccolto dai log), token di sessione</Bullet>
        </Section>

        <Section title="3. Dati Inseriti da Altri Membri della Famiglia" colors={colors}>
          <P colors={colors}>FamilySync è un'app condivisa: alcune informazioni che ti riguardano possono essere inserite da altri membri della tua famiglia (ad esempio il tuo soprannome, eventi che ti coinvolgono, faccende assegnate a te, ripartizioni di spesa o messaggi che ti citano).</P>
          <P colors={colors}>Chi inserisce dati relativi ad altre persone è responsabile di farlo in modo corretto e rispettoso. Se ritieni che un dato che ti riguarda sia inesatto o non debba essere presente, puoi modificarlo (dove previsto), chiedere al membro che lo ha inserito di correggerlo, oppure scriverci a assistenza@familysync.it.</P>
        </Section>

        <Section title="4. Finalità e Basi Giuridiche del Trattamento" colors={colors}>
          <Bullet colors={colors}>Erogazione del servizio (calendario, liste, faccende, chat, bollette, budget, ricette, sincronizzazione) → esecuzione del contratto (art. 6.1.b GDPR)</Bullet>
          <Bullet colors={colors}>Comunicazioni di servizio (verifica email, reset password, inviti) → esecuzione del contratto (art. 6.1.b)</Bullet>
          <Bullet colors={colors}>Funzionalità di intelligenza artificiale → consenso esplicito (art. 6.1.a), revocabile in qualsiasi momento</Bullet>
          <Bullet colors={colors}>Sicurezza, prevenzione abusi, rate limiting, log tecnici → legittimo interesse (art. 6.1.f) alla sicurezza del servizio</Bullet>
          <Bullet colors={colors}>Analytics interna temporanea di test (eventi tecnici minimi) → legittimo interesse (art. 6.1.f) al miglioramento e alla stabilità del servizio</Bullet>
          <Bullet colors={colors}>Adempimento di obblighi di legge → obbligo legale (art. 6.1.c)</Bullet>
        </Section>

        <Section title="5. Bollette e Scadenze" colors={colors}>
          <P colors={colors}>FamilySync consente di registrare bollette e scadenze domestiche, inclusi importi, scadenze, fornitori, intestatari, note, allegati e ricevute, oltre alla ripartizione delle spese tra i membri e allo storico dei pagamenti.</P>
          <P colors={colors}>Importante: l'app NON effettua pagamenti reali, NON elabora transazioni verso terzi, NON salva carte di credito, NON salva codici CVV e NON salva coordinate bancarie (IBAN). Lo stato "pagato" e gli importi sono registrazioni inserite manualmente a scopo organizzativo.</P>
        </Section>

        <Section title="6. Email Transazionali" colors={colors}>
          <P colors={colors}>FamilySync invia email transazionali tramite il fornitore Resend per: verifica dell'account, inviti familiari, reset della password e comunicazioni essenziali.</P>
          <P colors={colors}>Le email non contengono mai la password. I link di verifica e reset hanno una durata limitata nel tempo (vedi Conservazione dei Dati).</P>
        </Section>

        <Section title="7. Funzionalità di Intelligenza Artificiale (AI)" colors={colors}>
          <P colors={colors}>FamilySync offre funzionalità facoltative basate sull'intelligenza artificiale tramite il fornitore OpenAI. Le funzioni AI sono disattivate finché non le attivi tu: il consenso non è mai preselezionato, viene richiesto in fase di registrazione oppure può essere prestato in seguito dalle impostazioni, ed è revocabile in qualsiasi momento (Famiglia → Centro Privacy).</P>
          <P colors={colors}>Le funzioni AI disponibili e i dati inviati al fornitore per ciascuna sono:</P>
          <Bullet colors={colors}>Suggerimenti spesa: numero di membri (senza nomi), articoli recenti delle liste, contenuto della dispensa, titoli degli eventi in programma, stagione corrente</Bullet>
          <Bullet colors={colors}>Ottimizzazione faccende: soprannomi dei membri, punti accumulati, titoli e durata stimata delle faccende</Bullet>
          <Bullet colors={colors}>Insights familiari e consigli di risparmio: conteggi aggregati (eventi, faccende, spese per categoria), soprannome del miglior contributore, punti settimanali</Bullet>
          <Bullet colors={colors}>Ricette e piani pasti: preferenze indicate, ingredienti disponibili in dispensa, titoli delle ricette</Bullet>
          <Bullet colors={colors}>Compilazione assistita (eventi, faccende, bollette, spese): il testo libero che detti o scrivi per farti aiutare a compilare i campi</Bullet>
          <Bullet colors={colors}>Trascrizione vocale: la registrazione audio della tua voce, inviata al solo scopo di trascriverla in testo; l'audio non viene conservato sui nostri server</Bullet>
          <Bullet colors={colors}>Foto ricette AI: il titolo della ricetta, usato per generare un'immagine illustrativa del piatto</Bullet>
          <P colors={colors}>Dati NON inviati al fornitore AI: password, indirizzi email, dati di pagamento, allegati e ricevute, contenuti della chat, indirizzi fisici o numeri di telefono.</P>
          <P colors={colors}>Attenzione ai campi di testo libero: quando usi la dettatura o la compilazione assistita, il testo che scrivi o detti viene inviato al fornitore AI così com'è. Ti invitiamo a non inserire in questi campi dati sensibili (es. informazioni sulla salute) o dati di terze persone non necessari.</P>
          <P colors={colors}>In base ai termini contrattuali del fornitore applicabili all'uso via API, i dati inviati non vengono utilizzati per l'addestramento dei modelli. Il trattamento è regolato anche dalla Privacy Policy di OpenAI.</P>
          <P colors={colors}>I contenuti generati dall'AI sono chiaramente presentati come tali nell'app. Hanno natura indicativa, possono contenere errori e non costituiscono consulenza professionale. FamilySync non adotta decisioni basate unicamente su trattamenti automatizzati che producano effetti giuridici o significativi sugli utenti.</P>
          <P colors={colors}>Base giuridica: consenso esplicito (art. 6.1.a GDPR), revocabile in qualsiasi momento senza pregiudicare la liceità del trattamento precedente.</P>
        </Section>

        <Section title="8. Minori" colors={colors}>
          <P colors={colors}>FamilySync è un'app per il coordinamento familiare, pensata per essere usata dalla famiglia insieme.</P>
          <Bullet colors={colors}>Per creare un account in autonomia occorre avere almeno 14 anni (età del consenso digitale in Italia, art. 2-quinquies D.Lgs. 196/2003). La registrazione autonoma di minori di 14 anni non è consentita e viene bloccata</Bullet>
          <Bullet colors={colors}>I minori di 14 anni possono usare l'app solo tramite profili creati e supervisionati da un genitore o tutore che è membro della famiglia</Bullet>
          <Bullet colors={colors}>Per i profili di età inferiore ai 14 anni le funzioni AI non sono disponibili: il blocco è applicato dai nostri server e non dipende dalle impostazioni del dispositivo</Bullet>
          <Bullet colors={colors}>In fase di registrazione chiediamo solo una fascia di età, non la data di nascita, in linea con il principio di minimizzazione</Bullet>
          <Bullet colors={colors}>Se veniamo a conoscenza di aver raccolto dati di un minore di 14 anni senza il coinvolgimento di un genitore o tutore, provvederemo alla loro cancellazione tempestiva</Bullet>
          <P colors={colors}>Un'informativa semplificata per ragazze e ragazzi è disponibile nell'app (Famiglia → Centro Privacy) e sul sito, con un linguaggio adatto ai più giovani.</P>
        </Section>

        <Section title="9. Categorie Particolari di Dati (Dati Sensibili)" colors={colors}>
          <P colors={colors}>FamilySync non richiede e non è progettata per raccogliere categorie particolari di dati personali (art. 9 GDPR), come dati sulla salute, convinzioni religiose od opinioni politiche.</P>
          <P colors={colors}>Tuttavia, i campi di testo libero (eventi, note, chat, faccende, liste) potrebbero contenere informazioni di questo tipo se scelte e inserite dagli utenti (ad esempio "visita cardiologica" nel calendario). Questi contenuti restano visibili solo alla famiglia, non vengono usati per altre finalità e ti invitiamo a inserirli solo se necessario. Ricorda che, se attivi le funzioni AI, alcuni titoli o testi liberi possono essere inviati al fornitore AI (vedi sezione 7).</P>
        </Section>

        <Section title="10. Analytics Interna Temporanea (Periodo di Test)" colors={colors}>
          <P colors={colors}>Durante il periodo di test dell'app può essere attiva una raccolta interna e temporanea di eventi tecnici minimi (es. apertura dell'app, schermata visitata, errori tecnici), utile a verificare stabilità e funzionamento.</P>
          <Bullet colors={colors}>Non vengono registrati contenuti personali (niente messaggi, titoli, importi o dati delle liste)</Bullet>
          <Bullet colors={colors}>I metadati sono filtrati da una lista ristretta di campi tecnici ammessi</Bullet>
          <Bullet colors={colors}>Gli eventi sono conservati al massimo 30 giorni e poi cancellati automaticamente</Bullet>
          <Bullet colors={colors}>L'accesso è riservato al solo titolare dell'app; nessun dato è condiviso con terze parti</Bullet>
          <Bullet colors={colors}>Non vengono utilizzati SDK di analytics di terze parti né strumenti di tracciamento pubblicitario</Bullet>
          <P colors={colors}>Base giuridica: legittimo interesse (art. 6.1.f GDPR) al miglioramento e alla stabilità del servizio. Puoi opporti scrivendo a assistenza@familysync.it.</P>
        </Section>

        <Section title="11. Pagamenti e Abbonamenti Premium" colors={colors}>
          <P colors={colors}>Gli abbonamenti Premium nell'app mobile sono gestiti tramite gli acquisti in-app degli store, con gestione di abbonamenti ed entitlements affidata a RevenueCat:</P>
          <Bullet colors={colors}>Apple In-App Purchase / StoreKit su iOS</Bullet>
          <Bullet colors={colors}>Google Play Billing su Android</Bullet>
          <Bullet colors={colors}>RevenueCat per abbonamenti, stato dell'abbonamento ed entitlements</Bullet>
          <P colors={colors}>I dati delle carte sono trattati direttamente da Apple o Google; FamilySync non ha accesso ai dati completi della tua carta.</P>
        </Section>

        <Section title="12. Notifiche" colors={colors}>
          <Bullet colors={colors}>Notifiche locali: programmate sul dispositivo (es. promemoria scadenze bollette); non inviano i contenuti a server esterni</Bullet>
          <Bullet colors={colors}>Notifiche push remote: se attivate, possono usare un token push e i servizi di notifica di Expo/Apple/Google</Bullet>
          <Bullet colors={colors}>Notifiche push web: se attivate dal browser, usano il servizio push del browser stesso (Google, Apple, Mozilla o Microsoft), revocabile dalle impostazioni del browser</Bullet>
        </Section>

        <Section title="13. Fornitori e Condivisione con Terze Parti" colors={colors}>
          <P colors={colors}>Per erogare il servizio ci avvaliamo dei seguenti fornitori, ciascuno per le sole finalità indicate:</P>
          <Bullet colors={colors}>Replit, Inc.: hosting e deploy dell'applicazione e del backend (responsabile del trattamento)</Bullet>
          <Bullet colors={colors}>Neon, Inc. (PostgreSQL): database in cui sono archiviati i dati (responsabile del trattamento)</Bullet>
          <Bullet colors={colors}>Resend (Plus Five Five, Inc.): invio di email transazionali (responsabile del trattamento)</Bullet>
          <Bullet colors={colors}>OpenAI, L.L.C.: funzioni AI e trascrizione vocale, solo dati minimizzati e solo con il tuo consenso (responsabile del trattamento)</Bullet>
          <Bullet colors={colors}>RevenueCat, Inc.: gestione di abbonamenti e acquisti in-app (responsabile del trattamento)</Bullet>
          <Bullet colors={colors}>Apple e Google: acquisti in-app, login social e servizi di notifica; per queste attività operano in base alle proprie policy, in genere come titolari autonomi del trattamento</Bullet>
          <Bullet colors={colors}>Servizi di notifica push (Expo e, per il web, i servizi push del browser di Google/Apple/Mozilla/Microsoft): recapito delle notifiche push, se attive</Bullet>
          <P colors={colors}>Quando un fornitore tratta dati personali per conto di FamilySync, il rapporto è disciplinato, ove richiesto, da un accordo ai sensi dell'articolo 28 GDPR. Alcuni soggetti, come gli store o i provider di identità, possono trattare determinati dati anche come titolari autonomi secondo le rispettive informative.</P>
          <P colors={colors}>Non vendiamo, affittiamo o condividiamo i tuoi dati personali con terze parti per finalità di marketing.</P>
        </Section>

        <Section title="14. Trasferimenti Extra-SEE" colors={colors}>
          <P colors={colors}>Alcuni fornitori (es. OpenAI, Resend, RevenueCat, Apple, Google, Replit) hanno sede negli Stati Uniti o possono trattare i dati su infrastrutture fuori dallo Spazio Economico Europeo (SEE).</P>
          <P colors={colors}>In questi casi i trasferimenti si basano sulle garanzie previste dal GDPR, secondo quanto dichiarato da ciascun fornitore nei propri termini: in particolare le Clausole Contrattuali Standard (SCC) della Commissione Europea e, per i fornitori aderenti, il Data Privacy Framework UE-USA. Puoi chiederci maggiori informazioni scrivendo a assistenza@familysync.it.</P>
        </Section>

        <Section title="15. Conservazione dei Dati" colors={colors}>
          <Bullet colors={colors}>Dati dell'account: fino alla cancellazione dell'account</Bullet>
          <Bullet colors={colors}>Dati familiari (calendario, liste, faccende, chat, bollette, budget, ricette, allegati): fino alla cancellazione della famiglia o dell'account</Bullet>
          <Bullet colors={colors}>Token di reset password: 1 ora</Bullet>
          <Bullet colors={colors}>Token di verifica email: 6 ore</Bullet>
          <Bullet colors={colors}>Token di invito familiare: 72 ore</Bullet>
          <Bullet colors={colors}>Sessioni / refresh token: 7 giorni</Bullet>
          <Bullet colors={colors}>Eventi di analytics interna di test: massimo 30 giorni</Bullet>
          <Bullet colors={colors}>Registro dei consensi: per la durata dell'account e per il tempo necessario a dimostrare l'adempimento degli obblighi di legge</Bullet>
          <Bullet colors={colors}>Log di sistema: il tempo necessario, fino a un massimo di 12 mesi</Bullet>
          <Bullet colors={colors}>Registrazioni vocali per la trascrizione: non conservate sui nostri server</Bullet>
          <P colors={colors}>I dati possono inoltre risiedere temporaneamente nei backup dell'infrastruttura del fornitore di database, gestiti secondo i cicli tecnici di quest'ultimo, e vengono rimossi con la naturale rotazione dei backup.</P>
        </Section>

        <Section title="16. Cancellazione dell'Account" colors={colors}>
          <P colors={colors}>Puoi eliminare il tuo account in autonomia e in qualsiasi momento direttamente dall'app, nella scheda Famiglia → Elimina account, confermando con la tua password. In alternativa puoi richiedere la cancellazione scrivendo a assistenza@familysync.it.</P>
          <P colors={colors}>Cosa succede in concreto:</P>
          <Bullet colors={colors}>Il tuo profilo personale viene reso anonimo: nome ed email vengono rimossi e sostituiti, la password e i token di accesso vengono eliminati e non è più possibile accedere all'account</Bullet>
          <Bullet colors={colors}>Se sei l'unico membro di una famiglia, quella famiglia e tutti i suoi dati (calendario, liste, faccende, chat, allegati, bollette e ricevute) vengono eliminati definitivamente, inclusi i file fisici allegati</Bullet>
          <Bullet colors={colors}>Se la famiglia ha altri membri, i contenuti che hai condiviso restano visibili agli altri in forma anonima (autore mostrato come "Utente eliminato"): questo tutela la continuità dei dati condivisi della famiglia</Bullet>
          <P colors={colors}>L'eliminazione è definitiva e irreversibile. Alcuni dati possono essere conservati per adempiere a obblighi di legge. L'eliminazione dell'account non annulla automaticamente eventuali abbonamenti Premium, che vanno gestiti dallo store (Apple o Google).</P>
        </Section>

        <Section title="17. Diritti dell'Utente" colors={colors}>
          <P colors={colors}>In conformità con il GDPR (artt. 15-22), hai il diritto di:</P>
          <Bullet colors={colors}>Accesso: richiedere una copia dei tuoi dati personali</Bullet>
          <Bullet colors={colors}>Rettifica: correggere dati inesatti o incompleti</Bullet>
          <Bullet colors={colors}>Cancellazione: richiedere la cancellazione dei tuoi dati</Bullet>
          <Bullet colors={colors}>Portabilità: ricevere i tuoi dati in un formato strutturato, di uso comune e leggibile da dispositivo automatico</Bullet>
          <Bullet colors={colors}>Opposizione: opporti ai trattamenti basati sul legittimo interesse (ad esempio l'analytics interna di test)</Bullet>
          <Bullet colors={colors}>Limitazione: chiedere la limitazione del trattamento dei tuoi dati</Bullet>
          <Bullet colors={colors}>Revoca del consenso: revocare in qualsiasi momento i consensi prestati (es. per le funzioni AI, dal Centro Privacy nell'app), senza pregiudicare la liceità del trattamento precedente</Bullet>
          <Bullet colors={colors}>Reclamo: proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it)</Bullet>
          <P colors={colors}>Per esercitare questi diritti scrivi a assistenza@familysync.it. Per proteggerti, prima di dare seguito a una richiesta potremmo doverti chiedere elementi per verificare la tua identità. Rispondiamo entro un mese, prorogabile di due mesi nei casi complessi previsti dal GDPR. L'esportazione dei dati viene fornita tramite il canale email di assistenza.</P>
        </Section>

        <Section title="18. Violazioni dei Dati (Data Breach)" colors={colors}>
          <P colors={colors}>In caso di violazione dei dati personali che presenti un rischio per i diritti e le libertà degli utenti, notificheremo la violazione al Garante per la protezione dei dati personali entro 72 ore dal momento in cui ne veniamo a conoscenza, come previsto dall'art. 33 GDPR.</P>
          <P colors={colors}>Se la violazione presenta un rischio elevato per te, te ne daremo comunicazione senza ingiustificato ritardo (art. 34 GDPR), indicando la natura della violazione e le misure adottate.</P>
        </Section>

        <Section title="19. Cookie e Archiviazione Locale" colors={colors}>
          <P colors={colors}>FamilySync non utilizza cookie di profilazione né strumenti di tracciamento pubblicitario, né su mobile né su web.</P>
          <Bullet colors={colors}>App mobile: i dati di sessione (token di accesso) e alcune preferenze sono salvati nella memoria locale del dispositivo per mantenerti collegato e far funzionare la modalità offline</Bullet>
          <Bullet colors={colors}>Versione web: il browser salva i dati di sessione e le preferenze nella memoria locale (localStorage), una tecnologia strettamente necessaria al funzionamento del servizio; non vengono usati cookie di terze parti</Bullet>
          <Bullet colors={colors}>Eliminando i dati del sito dal browser o disinstallando l'app, questi dati locali vengono rimossi</Bullet>
        </Section>

        <Section title="20. Sicurezza" colors={colors}>
          <Bullet colors={colors}>Password conservate esclusivamente in forma hashata con algoritmi robusti e mai in chiaro</Bullet>
          <Bullet colors={colors}>Comunicazioni protette tramite protocollo HTTPS/TLS</Bullet>
          <Bullet colors={colors}>Autenticazione basata su token a scadenza temporale</Bullet>
          <Bullet colors={colors}>Token sensibili (verifica, reset, inviti) conservati solo in forma hashata</Bullet>
          <Bullet colors={colors}>Rate limiting e protezioni contro gli abusi delle API</Bullet>
          <Bullet colors={colors}>Header di sicurezza HTTP e controlli di accesso per famiglia</Bullet>
        </Section>

        <Section title="21. Modifiche alla Privacy Policy" colors={colors}>
          <P colors={colors}>Questa è la versione {`${PRIVACY_POLICY_VERSION}`} della Privacy Policy. Potremo aggiornarla in futuro: in caso di modifiche rilevanti lo comunicheremo tramite l'applicazione e/o via email, indicando la nuova versione e la data.</P>
        </Section>

        <Section title="22. Contatti" colors={colors}>
          <P colors={colors}>Per qualsiasi domanda relativa a questa Privacy Policy: assistenza@familysync.it</P>
        </Section>

        <Text style={[styles.updateDate, { color: colors.textSecondary }]}>
          Versione {PRIVACY_POLICY_VERSION} — Ultimo aggiornamento: {PRIVACY_POLICY_DATE}
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

function P({ children, colors }: { children: React.ReactNode; colors: any }) {
  return <Text style={[styles.paragraph, { color: colors.textSecondary }]}>{children}</Text>;
}

function Bullet({ children, colors }: { children: React.ReactNode; colors: any }) {
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
  versionBadge: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 20,
  },
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
