-- Profili bambino gestiti dai genitori: membri della famiglia SENZA account/email.
-- user_id diventa nullable (NULL = profilo gestito, nessun login) e si aggiunge
-- una colonna name per il nome visualizzato dei profili senza account.
-- Il vincolo unique (family_id, user_id) resta valido: in Postgres i NULL non
-- collidono tra loro, quindi più profili bambino per famiglia sono ammessi.
ALTER TABLE family_members ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS name varchar(100);
