import test from 'node:test';
import assert from 'node:assert/strict';
import { isPromptEcho } from '../lib/openai';

const BASE =
  'Dettatura vocale in italiano per un\'app di famiglia (eventi, spesa, faccende, ricette, budget). ' +
  'Date, giorni della settimana e orari come "venerdì alle 20", "domani alle 14:30".';
const CTX = 'Evento del calendario familiare: titolo, luogo, data, orario di inizio e fine, eventuale ripetizione.';
const PROMPT = `${BASE} ${CTX}`;

test('eco integrale del prompt viene scartato', () => {
  assert.equal(isPromptEcho(PROMPT, PROMPT), true);
});

test('eco parziale lungo del prompt viene scartato', () => {
  assert.equal(
    isPromptEcho('Dettatura vocale in italiano per un\'app di famiglia (eventi, spesa, faccende, ricette, budget).', PROMPT),
    true
  );
});

test('frase breve legittima presente nel prompt NON viene scartata', () => {
  assert.equal(isPromptEcho('venerdì alle 20', PROMPT), false);
  assert.equal(isPromptEcho('domani alle 14:30', PROMPT), false);
});

test('dettatura evento reale NON viene scartata', () => {
  assert.equal(
    isPromptEcho('Cena con Marco venerdì alle 20 da Luigi, fino alle 22', PROMPT),
    false
  );
  assert.equal(
    isPromptEcho('Compleanno di Sofia sabato 15 alle 16 al parco, ripetizione ogni anno', PROMPT),
    false
  );
});

test('testo vuoto o prompt vuoto: nessun filtro', () => {
  assert.equal(isPromptEcho('', PROMPT), false);
  assert.equal(isPromptEcho('ciao', ''), false);
});
