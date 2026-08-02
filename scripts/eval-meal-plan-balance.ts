/**
 * Valutazione ON-DEMAND dell'equilibrio del piano pasti mediterraneo.
 *
 * ATTENZIONE: questo script chiama davvero OpenAI (consuma quota/costi reali).
 * Non fa parte della suite di test automatica: la logica di conteggio è
 * coperta offline da server/__tests__/meal-plan-balance.test.ts e
 * server/__tests__/meal-plan-balance-monitor.test.ts.
 *
 * La stessa valutazione gira anche periodicamente lato server (una volta a
 * settimana) se MEAL_PLAN_BALANCE_MONITOR=true: vedi
 * server/lib/meal-plan-balance-monitor.ts (log con tag MEAL_PLAN_BALANCE,
 * email al proprietario in caso di squilibri).
 *
 * Uso:
 *   npx tsx scripts/eval-meal-plan-balance.ts [weekStartDate] [runs]
 *   es.: npx tsx scripts/eval-meal-plan-balance.ts 2026-08-03 2
 *
 * Exit code 0 se tutti i piani generati sono bilanciati, 1 altrimenti.
 */
import { runMealPlanBalanceEvalOnce, nextMondayIso } from '../server/lib/meal-plan-balance-monitor';

async function main() {
  const weekStartDate = process.argv[2] || nextMondayIso();
  const runs = Math.max(1, Math.min(5, Number(process.argv[3]) || 1));

  console.log(`Genero ${runs} piano/i mediterraneo/i (settimana dal ${weekStartDate}) — consuma quota AI reale.\n`);

  const result = await runMealPlanBalanceEvalOnce({ weekStartDate, runs });

  for (const { run, report } of result.runs) {
    console.log(`--- Run ${run}/${runs} ---`);
    console.log(`Giorni analizzati: ${report.daysAnalyzed} | pranzi: ${report.lunchCount} | cene: ${report.dinnerCount}`);
    console.log(`Pasta/riso a pranzo: ${report.pastaRiceLunches}/${report.lunchCount}`);
    console.log(`Legumi (pranzi+cene): ${report.legumeMeals} (max 3)`);
    console.log(`Pesce (pranzi+cene): ${report.fishMeals} (min 2)`);
    console.log(`Slot senza verdure: ${report.missingVegetableSlots.length}`);
    if (report.balanced) {
      console.log('✅ Piano BILANCIATO secondo le soglie mediterranee.\n');
    } else {
      console.log('❌ SQUILIBRI RILEVATI:');
      for (const issue of report.issues) console.log(`   - ${issue}`);
      console.log('');
    }
  }

  process.exit(result.allBalanced ? 0 : 1);
}

main().catch((err) => {
  console.error('Errore durante la valutazione:', err);
  process.exit(1);
});
