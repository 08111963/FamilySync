// Fixture eseguita come processo figlio dai test di redazione log.
// Importa il logger (che in produzione patcha console.*) e poi emette su
// console.log/console.error una serie di payload sensibili. Il test padre
// cattura stdout/stderr e verifica la (non-)redazione a seconda di NODE_ENV.
import "../../lib/logger";

// Email in chiaro
console.log("utente mario.rossi@example.com ha effettuato il login");

// JWT
console.error(
  "auth fallita per token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c",
);

// Oggetto circolare con segreti annidati
const circ: Record<string, unknown> = {
  email: "anna.bianchi@example.it",
  access_token: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
};
circ.self = circ;
console.log(circ);

// BigInt (JSON.stringify lancerebbe: util.inspect no)
console.log({ big: 123456789012345678901234567890n, password: "hunter2segretissima" });

// Valore con apostrofo: util.inspect lo emette con doppi apici
console.log({ password: "l'apostrofo-mi-bypassava-1x", note: "ok" });

// Chiave quotata da inspect (non-identificatore) + backtick (apici misti)
console.log({ "api_key": "chiave-super-segreta-2x", secret: `mi'sto"nascondendo` });

// Error con stack contenente un token hex
console.error(new Error("boom per token deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"));

// URL con access_token
console.log("GET /callback?access_token=sk_live_TOKENSEGRETO123&state=ok");
