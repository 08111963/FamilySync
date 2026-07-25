// Normalizza i deep link nativi (Expo Go usa il prefisso /--/ prima del percorso).
// IMPORTANTE: non ridirigere tutto a '/', altrimenti i link di ritorno OAuth
// (login?loginCode=...) e gli inviti famiglia vengono persi e l'utente
// finisce sulla pagina di benvenuto invece di completare l'accesso.
export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  try {
    // Estrae il percorso dopo l'eventuale prefisso Expo Go "/--".
    let clean = path;
    const marker = clean.indexOf('/--/');
    if (marker !== -1) {
      clean = clean.slice(marker + 3); // mantiene lo slash iniziale
    }
    // Rimuove schema/host se presenti (es. exp://host/percorso).
    if (clean.includes('://')) {
      const url = new URL(clean.replace(/^exp(s)?:\/\//, 'http://'));
      clean = url.pathname + url.search;
    }
    if (!clean.startsWith('/')) clean = '/' + clean;
    // Percorsi che devono arrivare intatti alla destinazione.
    const passthrough = ['/login', '/join', '/join-link', '/reset-password', '/verify-email', '/social-complete'];
    if (passthrough.some((p) => clean === p || clean.startsWith(p + '/') || clean.startsWith(p + '?'))) {
      return clean;
    }
    return '/';
  } catch {
    return '/';
  }
}
