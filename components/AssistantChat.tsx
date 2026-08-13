import { useState, useRef } from "react";
import {
  StyleSheet, Text, View, Modal, Pressable, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { apiRequest, apiFetch, getApiErrorMessage } from "@/lib/query-client";
import { aiErrorMessage, isAiDisabled, openAiSettings } from "@/lib/ai-error-message";
import { VoiceInput } from "@/components/VoiceInput";
import { buildRecurrenceRule } from "@/shared/chore-recurrence";

// ===== Tipi delle azioni restituite da /assistant-parse =====

type ParsedEventAction = {
  title: string; location: string | null; description: string | null;
  date: string | null; time: string | null; endTime: string | null;
  repeat: "daily" | "weekly" | "monthly" | null; weekdays: number[]; monthDays: number[];
  assigneeName: string | null; assigneeMemberId: string | null;
};
type ParsedChoreAction = {
  title: string; description: string | null; points: number | null; difficulty: number | null;
  estimatedMinutes: number | null; dueDate: string | null;
  repeat: "daily" | "weekly" | "monthly" | null; weekdays: number[]; monthDays: number[];
  assigneeName: string | null; assigneeMemberId: string | null;
};
type ParsedShoppingAction = { name: string; quantity: number | null; unit: string | null };
type ParsedBillAction = { title: string; amount: number | null; dueDate: string | null; category: string | null };
type ParsedRewardAction = { title: string; description: string | null; pointsCost: number | null };
type ParsedMealAction = { date: string | null; mealType: "breakfast" | "lunch" | "dinner" | "snack" | null; title: string };

type AssistantActions = {
  events: ParsedEventAction[];
  chores: ParsedChoreAction[];
  shoppingItems: ParsedShoppingAction[];
  bills: ParsedBillAction[];
  rewards: ParsedRewardAction[];
  meals: ParsedMealAction[];
  // Richiesta di generare un piano pasti settimanale intero: alla conferma
  // portiamo l'utente alla schermata Piano Pasti con le preferenze precompilate.
  mealPlanRequest: { notes: string } | null;
};

type ChatMessage =
  | { kind: "text"; role: "user" | "assistant"; text: string }
  | { kind: "proposal"; actions: AssistantActions; decided: boolean };

// ===== Utilità di presentazione =====

const MEAL_LABELS: Record<string, string> = {
  breakfast: "colazione", lunch: "pranzo", dinner: "cena", snack: "merenda",
};
const UNIT_LABELS: Record<string, string> = { pcs: "pz", g: "g", kg: "kg", ml: "ml", l: "l" };

function formatDateIt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

/** Lunedì della settimana della data indicata (per i piani pasti). */
function mondayOfWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = lunedì
  d.setDate(d.getDate() - dow);
  return d.toLocaleDateString("en-CA");
}

function totalActions(a: AssistantActions): number {
  return a.events.length + a.chores.length + a.shoppingItems.length
    + a.bills.length + a.rewards.length + a.meals.length
    + (a.mealPlanRequest ? 1 : 0);
}

interface AssistantChatProps {
  familyId: string;
  /** Ruolo del membro corrente: i premi sono creabili solo da admin/adult. */
  memberRole?: string | null;
}

/**
 * Assistente AI della Home: pulsante flottante (🤖) sempre in primo piano che
 * apre una chat. L'utente scrive o detta cosa aggiungere; l'AI smista in
 * faccende/eventi/spesa/bollette/premi/pasti; PRIMA di salvare mostra sempre un
 * riepilogo con conferma. Il salvataggio riusa le rotte esistenti, così
 * notifiche, ricorrenze e permessi restano identici all'inserimento manuale.
 */
export function AssistantChat({ familyId, memberRole }: AssistantChatProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [parsing, setParsing] = useState(false);
  const [executing, setExecuting] = useState(false);
  // Guardia SINCRONA contro il doppio tap su "Conferma": lo stato React si
  // propaga solo al render successivo, quindi due tap ravvicinati potrebbero
  // eseguire le azioni due volte (duplicati). Il ref si aggiorna subito.
  const executingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const canManageRewards = memberRole === "admin" || memberRole === "adult";

  // Gli account bambino non possono usare le funzioni AI (blocco già applicato
  // dal server): non mostrare nemmeno il pulsante.
  if (memberRole === "child") return null;

  const pushMessage = (m: ChatMessage) => {
    setMessages((prev) => [...prev, m]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const handleSend = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || parsing || executing) return;
    setInput("");
    pushMessage({ kind: "text", role: "user", text });
    setParsing(true);
    try {
      const res = await apiRequest("POST", `/api/ai/${familyId}/assistant-parse`, { text });
      const actions = (await res.json()) as AssistantActions;
      pushMessage({ kind: "proposal", actions, decided: false });
    } catch (err) {
      if (isAiDisabled(err)) {
        pushMessage({ kind: "text", role: "assistant", text: "Le funzioni AI sono disattivate. Attivale dal Centro Privacy (Famiglia → Centro Privacy) e riprova." });
      } else {
        pushMessage({ kind: "text", role: "assistant", text: aiErrorMessage(err, "Non ho capito la richiesta. Prova a riformularla, ad esempio: \"Domani alle 18 dentista per Anna e aggiungi il latte alla spesa\".") });
      }
    } finally {
      setParsing(false);
    }
  };

  // ===== Esecuzione (dopo conferma): riusa le rotte esistenti =====

  const executeActions = async (actions: AssistantActions, msgIndex: number) => {
    if (executingRef.current) return;
    // Ignora conferme su proposte già decise (es. tap arrivato dopo l'esecuzione).
    const current = messages[msgIndex];
    if (current?.kind === "proposal" && current.decided) return;
    executingRef.current = true;
    setExecuting(true);
    setMessages((prev) => prev.map((m, i) => (i === msgIndex && m.kind === "proposal" ? { ...m, decided: true } : m)));
    const ok: string[] = [];
    const failed: string[] = [];

    const run = async (label: string, fn: () => Promise<unknown>) => {
      try { await fn(); ok.push(label); }
      catch (err) { failed.push(`${label} (${getApiErrorMessage(err, "errore")})`); }
    };

    for (const e of actions.events) {
      await run(`Evento "${e.title}"`, async () => {
        const recurrenceRule = e.repeat
          ? buildRecurrenceRule(e.repeat, { weekdays: e.weekdays, monthDays: e.monthDays })
          : undefined;
        await apiRequest("POST", `/api/calendar/${familyId}`, {
          title: e.title,
          date: e.date ?? todayIso(),
          time: e.time ?? undefined,
          endTime: e.endTime ?? undefined,
          location: e.location ?? undefined,
          description: e.description ?? undefined,
          memberId: e.assigneeMemberId ?? undefined,
          recurrenceRule,
        });
      });
    }

    for (const c of actions.chores) {
      await run(`Faccenda "${c.title}"`, async () => {
        const recurrenceRule = c.repeat
          ? buildRecurrenceRule(c.repeat, { weekdays: c.weekdays, monthDays: c.monthDays })
          : undefined;
        await apiRequest("POST", `/api/chores/${familyId}`, {
          title: c.title,
          description: c.description ?? undefined,
          points: c.points ?? undefined,
          difficulty: c.difficulty ?? undefined,
          estimatedMinutes: c.estimatedMinutes ?? undefined,
          assignedTo: c.assigneeMemberId ?? undefined,
          dueDate: c.dueDate ?? undefined,
          recurrenceRule,
        });
      });
    }

    if (actions.shoppingItems.length > 0) {
      // Serve una lista: usa la prima esistente, altrimenti creala.
      let listId: string | null = null;
      try {
        const lists = await apiFetch<Array<{ id: string }>>(`/api/shopping/${familyId}/lists`);
        listId = lists[0]?.id ?? null;
        if (!listId) {
          const res = await apiRequest("POST", `/api/shopping/${familyId}/lists`, { name: "Lista della spesa" });
          listId = ((await res.json()) as { id: string }).id;
        }
      } catch (err) {
        failed.push(`Lista della spesa (${getApiErrorMessage(err, "errore")})`);
      }
      if (listId) {
        for (const s of actions.shoppingItems) {
          await run(`Spesa "${s.name}"`, () => apiRequest("POST", `/api/shopping/${familyId}/lists/${listId}/items`, {
            name: s.name,
            quantity: s.quantity ?? undefined,
            unit: s.unit ?? undefined,
          }));
        }
      }
    }

    for (const b of actions.bills) {
      await run(`Bolletta "${b.title}"`, () => apiRequest("POST", `/api/bills/${familyId}`, {
        title: b.title,
        amount: b.amount ?? 0,
        // La scadenza è obbligatoria: se non indicata, proponiamo tra 7 giorni
        // (mostrato già nel riepilogo prima della conferma).
        dueDate: b.dueDate ?? addDaysIso(todayIso(), 7),
        category: b.category ?? undefined,
      }));
    }

    for (const r of actions.rewards) {
      await run(`Premio "${r.title}"`, () => apiRequest("POST", `/api/rewards/${familyId}`, {
        title: r.title,
        description: r.description ?? undefined,
        pointsCost: r.pointsCost ?? 10,
      }));
    }

    if (actions.meals.length > 0) {
      // Raggruppa i pasti per settimana: un piano per settimana (creato se manca).
      type Plan = { id: string; weekStartDate: string };
      let plans: Plan[] = [];
      try {
        plans = await apiFetch<Plan[]>(`/api/meal-plans/${familyId}/meal-plans`);
      } catch {
        // se la lista non si carica, i singoli pasti falliranno con messaggio chiaro
      }
      for (const m of actions.meals) {
        const date = m.date ?? todayIso();
        const week = mondayOfWeek(date);
        const label = `Pasto "${m.title}" (${MEAL_LABELS[m.mealType ?? "dinner"]})`;
        await run(label, async () => {
          let plan = plans.find((p) => p.weekStartDate === week);
          if (!plan) {
            const res = await apiRequest("POST", `/api/meal-plans/${familyId}/meal-plans`, {
              weekStartDate: week,
              items: [],
            });
            plan = (await res.json()) as Plan;
            plans.push(plan);
          }
          await apiRequest("POST", `/api/meal-plans/${familyId}/meal-plans/${plan.id}/items`, {
            date,
            mealType: m.mealType ?? "dinner",
            titleOverride: m.title,
          });
        });
      }
    }

    // Aggiorna le sezioni interessate (stesse chiavi usate dalle schermate).
    qc.invalidateQueries({ queryKey: ["/api/calendar", familyId] });
    qc.invalidateQueries({ queryKey: ["/api/chores", familyId] });
    qc.invalidateQueries({ queryKey: ["/api/shopping", familyId, "lists"] });
    qc.invalidateQueries({ queryKey: [`/api/bills/${familyId}`] });
    qc.invalidateQueries({ queryKey: [`/api/rewards/${familyId}`] });
    qc.invalidateQueries({ queryKey: ["/api/meal-plans", familyId, "meal-plans"] });

    let summary = "";
    if (ok.length > 0) summary += `Fatto! Ho aggiunto:\n• ${ok.join("\n• ")}`;
    if (failed.length > 0) summary += `${summary ? "\n\n" : ""}Non sono riuscito ad aggiungere:\n• ${failed.join("\n• ")}`;

    // Piano pasti settimanale: portiamo l'utente alla schermata Piano Pasti con
    // le preferenze precompilate; la generazione (che consuma la quota AI) parte
    // solo quando preme "Genera Piano" lì.
    if (actions.mealPlanRequest) {
      summary += `${summary ? "\n\n" : ""}Ti porto al Piano Pasti: premi "Genera Piano" per creare il piano settimanale.`;
      pushMessage({ kind: "text", role: "assistant", text: summary });
      executingRef.current = false;
      setExecuting(false);
      setOpen(false);
      const notes = actions.mealPlanRequest.notes.trim();
      router.push((notes ? `/meal-plans?notes=${encodeURIComponent(notes)}` : "/meal-plans") as any);
      return;
    }

    pushMessage({ kind: "text", role: "assistant", text: summary || "Nessuna azione eseguita." });
    executingRef.current = false;
    setExecuting(false);
  };

  const cancelProposal = (msgIndex: number) => {
    setMessages((prev) => prev.map((m, i) => (i === msgIndex && m.kind === "proposal" ? { ...m, decided: true } : m)));
    pushMessage({ kind: "text", role: "assistant", text: "Va bene, non ho aggiunto nulla. Riformula pure la richiesta." });
  };

  // ===== Render del riepilogo di una proposta =====

  const renderProposal = (actions: AssistantActions, decided: boolean, msgIndex: number) => {
    const lines: string[] = [];
    for (const e of actions.events) {
      let l = `📅 Evento: ${e.title}`;
      l += e.date ? ` — ${formatDateIt(e.date)}` : " — oggi (data non indicata)";
      if (e.time) l += ` ore ${e.time}`;
      if (e.repeat) l += " (ricorrente)";
      if (e.assigneeName && e.assigneeMemberId) l += ` · per ${e.assigneeName}`;
      lines.push(l);
    }
    for (const c of actions.chores) {
      let l = `🧹 Faccenda: ${c.title}`;
      if (c.repeat) l += " (ricorrente)";
      else if (c.dueDate) l += ` — entro ${formatDateIt(c.dueDate)}`;
      if (c.points) l += ` · ${c.points} punti`;
      if (c.assigneeName && c.assigneeMemberId) l += ` · per ${c.assigneeName}`;
      lines.push(l);
    }
    for (const s of actions.shoppingItems) {
      let l = `🛒 Spesa: ${s.name}`;
      if (s.quantity) l += ` — ${s.quantity}${s.unit ? ` ${UNIT_LABELS[s.unit] ?? s.unit}` : ""}`;
      lines.push(l);
    }
    for (const b of actions.bills) {
      let l = `💡 Bolletta: ${b.title}`;
      if (b.amount != null) l += ` — ${b.amount.toLocaleString("it-IT")} €`;
      l += b.dueDate ? ` · scade ${formatDateIt(b.dueDate)}` : ` · scadenza non indicata → tra 7 giorni`;
      lines.push(l);
    }
    for (const r of actions.rewards) {
      lines.push(`🏆 Premio: ${r.title} — ${r.pointsCost ?? 10} punti${canManageRewards ? "" : " (servono permessi admin/adulto)"}`);
    }
    for (const m of actions.meals) {
      lines.push(`🍽️ Pasto: ${m.title} — ${m.date ? formatDateIt(m.date) : "oggi"}, ${MEAL_LABELS[m.mealType ?? "dinner"]}`);
    }
    if (actions.mealPlanRequest) {
      const notes = actions.mealPlanRequest.notes.trim();
      lines.push(`🍽️ Piano pasti settimanale${notes ? ` (preferenze: ${notes})` : ""} — apro la schermata Piano Pasti`);
    }

    return (
      <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.proposalTitle, { color: colors.text }]}>
          Sto per aggiungere ({totalActions(actions)}):
        </Text>
        {lines.map((l, i) => (
          <Text key={i} style={[styles.proposalLine, { color: colors.text }]}>{l}</Text>
        ))}
        {!decided && (
          <View style={styles.proposalButtons}>
            <Pressable
              onPress={() => cancelProposal(msgIndex)}
              disabled={executing}
              style={[styles.proposalBtn, { borderColor: colors.border }]}
              testID="assistant-cancel"
            >
              <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Annulla</Text>
            </Pressable>
            <Pressable
              onPress={() => executeActions(actions, msgIndex)}
              disabled={executing}
              style={[styles.proposalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              testID="assistant-confirm"
            >
              {executing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: "#fff", fontWeight: "700" }}>Conferma</Text>}
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      {/* Pulsante flottante: sempre in primo piano sopra il contenuto della Home */}
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: 88 + insets.bottom }]}
        testID="assistant-fab"
        accessibilityLabel="Apri l'assistente AI"
      >
        <Text style={styles.fabEmoji}>🤖</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalWrap}
          >
            <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
              <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
                <Text style={styles.headerEmoji}>🤖</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>Assistente FamilySync</Text>
                  <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                    Detta o scrivi: faccende, eventi, spesa, bollette, premi, pasti
                  </Text>
                </View>
                <Pressable onPress={() => setOpen(false)} hitSlop={12} testID="assistant-close">
                  <Ionicons name="close" size={26} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView
                ref={scrollRef}
                style={styles.messages}
                contentContainerStyle={{ padding: 14, gap: 10 }}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
              >
                {messages.length === 0 && (
                  <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={{ color: colors.text, lineHeight: 20 }}>
                      Ciao! Dimmi cosa aggiungere e ci penso io. Ad esempio:{"\n\n"}
                      “Domani alle 18 dentista per Anna, spazzatura ogni martedì a Marco, e metti latte e pane nella spesa”.{"\n\n"}
                      Prima di salvare ti mostro sempre il riepilogo per conferma.
                    </Text>
                  </View>
                )}
                {messages.map((m, i) =>
                  m.kind === "proposal"
                    ? <View key={i}>{renderProposal(m.actions, m.decided, i)}</View>
                    : (
                      <View
                        key={i}
                        style={[
                          styles.bubble,
                          m.role === "user"
                            ? [styles.userBubble, { backgroundColor: colors.primary }]
                            : [styles.assistantBubble, { backgroundColor: colors.surface, borderColor: colors.border }],
                        ]}
                      >
                        <Text style={{ color: m.role === "user" ? "#fff" : colors.text, lineHeight: 20 }}>{m.text}</Text>
                      </View>
                    )
                )}
                {parsing && (
                  <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                )}
              </ScrollView>

              <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="Scrivi cosa aggiungere…"
                  placeholderTextColor={colors.textSecondary}
                  value={input}
                  onChangeText={setInput}
                  multiline
                  editable={!parsing && !executing}
                  testID="assistant-input"
                />
                <VoiceInput
                  familyId={familyId}
                  disabled={parsing || executing}
                  context="richiesta all'assistente: faccende, eventi, spesa, bollette, premi o pasti da aggiungere"
                  onTranscribed={(t) => handleSend(t)}
                />
                <Pressable
                  onPress={() => handleSend()}
                  disabled={!input.trim() || parsing || executing}
                  style={[styles.sendBtn, { backgroundColor: input.trim() && !parsing ? colors.primary : colors.border }]}
                  testID="assistant-send"
                >
                  <Ionicons name="send" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 50,
  },
  fabEmoji: { fontSize: 30 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalWrap: { maxHeight: "88%" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: Platform.OS === "web" ? 600 : "100%",
    maxHeight: "100%",
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerEmoji: { fontSize: 28 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  headerSub: { fontSize: 12, marginTop: 1 },
  messages: { flexGrow: 1 },
  bubble: {
    maxWidth: "88%",
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: "flex-start", borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 },
  proposalTitle: { fontWeight: "700", marginBottom: 6 },
  proposalLine: { lineHeight: 21 },
  proposalButtons: { flexDirection: "row", gap: 10, marginTop: 12 },
  proposalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    maxHeight: 110,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
