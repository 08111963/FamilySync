-- Inviti di "promozione" profilo bambino -> account vero:
-- family_invites.member_id punta al family_members esistente (userId NULL).
-- All'accettazione l'account viene COLLEGATO a quel membro (punti/storico preservati).
ALTER TABLE family_invites
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES family_members(id) ON DELETE CASCADE;
