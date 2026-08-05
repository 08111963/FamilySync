# Guida: aprire "Collega Google Calendar" a tutti gli utenti (verifica Google)

Oggi il progetto Google Cloud "FamilySync" è in stato **"Test in corso"**: solo gli
account aggiunti a mano come "Utenti di prova" (massimo 100) possono collegare
Google Calendar. Tutti gli altri ricevono **"Errore 403: access_denied"**.
Per aprire la funzione a tutti bisogna:

1. completare la schermata di consenso (Branding);
2. pubblicare l'app OAuth "In produzione";
3. inviare la richiesta di **verifica** a Google per lo scope sensibile
   `https://www.googleapis.com/auth/calendar.events`.

La verifica richiede in genere **da alcuni giorni a 4-6 settimane**. Nel
frattempo l'app mostra già un messaggio comprensibile a chi riceve
`access_denied` ("funzione in beta, solo tester").

---

## 1. Checklist dei requisiti (prima di inviare la richiesta)

Spunta ogni riga prima di procedere:

- [ ] **Homepage pubblica**: `https://familysync.eu` è online e descrive l'app.
      Deve essere raggiungibile senza login e appartenere a te (verificata in
      Google Search Console, vedi punto 2.3).
- [ ] **Privacy policy pubblica**: `https://familysync.eu/legal/privacy` è già
      online in una pagina dedicata. ⚠️ **Attenzione**: Google richiede che la
      policy **menzioni esplicitamente l'uso dei dati Google** (es. "se colleghi
      Google Calendar, FamilySync scrive gli eventi della famiglia nel tuo
      calendario e conserva un token di accesso cifrato e l'email dell'account
      collegato"). Oggi la policy non contiene questo paragrafo: **va aggiunto
      prima di inviare la verifica** (chiedi all'assistente di aggiornare la
      policy — il testo vive in un'unica fonte condivisa e l'aggiornamento
      gestisce anche versione e consensi).
- [ ] **Termini d'uso pubblici**: `https://familysync.eu/legal/terms` (link
      da inserire anche nella schermata di consenso).
- [ ] **Logo dell'app**: immagine quadrata (120x120 px consigliato, max 1 MB,
      JPG/PNG). Attenzione: **caricare o cambiare il logo fa scattare
      obbligatoriamente la verifica**, quindi fallo insieme al resto.
- [ ] **Scope minimi**: chiediamo solo `calendar.events` + `openid email`.
      Non aggiungere altri scope: ogni scope sensibile in più allunga la verifica.
- [ ] **Video dimostrativo** (Google lo chiede quasi sempre per scope
      sensibili): un video **in inglese**, non in elenco pubblico va bene
      (YouTube "non in elenco"), che mostri:
      1. l'URL completo della schermata di consenso OAuth (si deve vedere il
         `client_id` nella barra indirizzi o il nome del progetto);
      2. il flusso completo: nell'app si preme "Collega Google Calendar", si
         arriva al consenso Google, si accetta;
      3. **come viene usato lo scope**: si crea un evento in FamilySync e si fa
         vedere che compare nel Google Calendar dell'utente.
- [ ] **Giustificazione dello scope** pronta (testo da incollare, vedi sotto).

### Testo pronto per la giustificazione di `calendar.events` (in inglese)

> FamilySync is a family organizer app. When a user explicitly connects their
> Google account from the "Sync calendar" screen, FamilySync writes the
> family's shared events (and their updates/deletions) directly into the
> user's own Google Calendar in real time, so the family agenda stays in sync
> with the calendar the user already uses. The `calendar.events` scope is
> required to create, update and delete these events. We do not read or
> modify any events not created by FamilySync. Each user can disconnect at
> any time from the same screen, which revokes the token and stops all sync.

---

## 2. Preparare la schermata di consenso (Branding)

Vai su [console.cloud.google.com](https://console.cloud.google.com), scegli il
progetto **FamilySync**, poi menu ☰ → **API e servizi** → **Schermata consenso
OAuth** (oggi si chiama anche "Google Auth Platform" → **Branding**).

Compila tutto:

1. **Nome dell'app**: `FamilySync`
2. **Email di assistenza utenti**: `assistenza@familysync.it` (o l'email
   dell'account owner).
3. **Logo dell'app**: carica il logo (vedi checklist).
4. **Dominio dell'app**:
   - Home page dell'applicazione: `https://familysync.eu`
   - Link norme sulla privacy: `https://familysync.eu/legal/privacy`
   - Link Termini di servizio: `https://familysync.eu/legal/terms`
5. **Domini autorizzati**: aggiungi `familysync.eu`.
   ⚠️ Per poterlo aggiungere, il dominio deve risultare **verificato** con lo
   stesso account Google in **Google Search Console**
   ([search.google.com/search-console](https://search.google.com/search-console)):
   aggiungi la proprietà "Dominio" `familysync.eu` e verifica con il record
   DNS TXT che Google ti indica (si aggiunge dal pannello del tuo provider di
   dominio; la verifica richiede pochi minuti/ore).
6. **Email di contatto sviluppatore**: la tua email (Google la usa per la
   pratica di verifica: controllala spesso!).
7. Salva.

Controlla anche **API e servizi → Credenziali → il client OAuth**: l'URI di
reindirizzamento autorizzato deve includere
`https://familysync.eu/api/calendar-sync/google/callback` (quello che l'app usa
in produzione).

---

## 3. Dichiarare gli scope

Sempre in "Schermata consenso OAuth" → sezione/scheda **Ambiti (Scopes)** →
"Aggiungi o rimuovi ambiti":

- `.../auth/calendar.events` (sensibile — è quello che fa scattare la verifica)
- `openid`
- `.../auth/userinfo.email`

Salva. Non aggiungere altro.

---

## 4. Pubblicare "In produzione" e inviare la verifica

1. In "Schermata consenso OAuth" (o "Google Auth Platform" → **Pubblico /
   Audience**), premi **"Pubblica app"** → stato passa a **"In produzione"**.
2. Google ti avvisa che, avendo scope sensibili, serve la verifica: comparirà
   il pulsante/sezione **"Centro di verifica"** (Verification Center) →
   **"Prepara per la verifica" / "Invia per la verifica"**.
3. Compila il modulo:
   - conferma homepage, privacy policy, domini autorizzati (già fatti al punto 2);
   - per lo scope `calendar.events` incolla la **giustificazione** qui sopra;
   - incolla il **link del video dimostrativo** YouTube (non in elenco);
   - conferma l'email di contatto sviluppatore.
4. Invia. Riceverai email da un indirizzo tipo
   `api-oauth-dev-verification@google.com`: **rispondi sempre dalla stessa
   email di contatto**, anche solo per dire "fatto", altrimenti la pratica si
   blocca.

### Cosa succede nel frattempo

- Appena pubblichi "In produzione" **prima** che la verifica sia completata,
  gli utenti non tester non ricevono più il 403 secco: vedono una schermata di
  avviso "app non verificata" con più passaggi. È bruttina ma funziona (fino a
  100 nuovi utenti). La verifica completata rimuove l'avviso e ogni limite.
- Se Google chiede modifiche (succede spesso al primo giro: es. la privacy
  policy deve citare esplicitamente "Google user data"), fai la modifica e
  rispondi alla stessa email della pratica.

### Nota: NON serve il CASA / security assessment

Lo scope `calendar.events` è **sensibile** ma non "restricted": non è
richiesto l'audit di sicurezza a pagamento (quello vale per Gmail/Drive).

---

## 5. Dopo l'approvazione

1. Prova con un account Google **non** presente tra gli utenti di prova:
   "Collega Google Calendar" deve funzionare senza errori né avvisi.
2. Gli utenti di prova esistenti non devono rifare nulla.
3. Non cambiare logo, nome app, domini o scope senza motivo: ogni modifica al
   branding può far ripartire una nuova verifica.

## Problemi comuni

| Sintomo | Causa probabile | Rimedio |
| --- | --- | --- |
| "Errore 403: access_denied" | App ancora "In test" e utente non tester | Pubblicare in produzione (punto 4) |
| Impossibile aggiungere `familysync.eu` ai domini autorizzati | Dominio non verificato in Search Console | Punto 2.5 |
| Verifica rifiutata: "privacy policy" | La policy non cita l'uso dei dati Google | Aggiornare la policy e rispondere all'email |
| Nessuna risposta da Google da >2 settimane | Email di verifica finita nello spam / mai risposto | Controllare spam e rispondere alla pratica |
