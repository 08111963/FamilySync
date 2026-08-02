/**
 * Valutazione MANUALE dell'equilibrio del piano pasti mediterraneo.
 *
 * ATTENZIONE: questo script chiama davvero OpenAI (consuma quota/costi reali).
 * Non fa parte della suite di test automatica: la logica di conteggio è
 * coperta offline da server/__tests__/meal-plan-balance.test.ts.
 *
 * Uso:
 *   npx tsx scripts/eval-meal-plan-balance.ts [weekStartDate] [runs]
 *   es.: npx tsx scripts/eval-meal-plan-balance.ts 2026-08-03 2
 *
 * Exit code 0 se tutti i piani generati sono bilanciati, 1 altrimenti.
 */
import { generateWeeklyMealPlan } from '../server/lib/openai';
import { analyzeMediterraneanBalance } from '../server/lib/meal-plan-balance';

async function main() {
  const weekStartDate = process.argv[2] || new Date().toISOString().split('T')[0]!;
  const runs = Math.max(1, Math.min(5, Number(process.argv[3]) || 1));

  console.log(`Genero ${runs} piano/i mediterraneo/i (settimana dal ${weekStartDate}) — consuma quota AI reale.\n`);

  let allBalanced = true;
  for (let run = 1; run <= runs; run++) {
    console.log(`--- Run ${run}/${runs} ---`);
    const plan = await generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate,
      preferences: { diet: 'Mediterranea', mealsPerDay: 3 },
    });

    for (const it of plan.items) {
      console.log(`  ${it.date} ${it.mealType.padEnd(9)} ${it.title}`);
    }

    const report = analyzeMediterraneanBalance(plan.items);
    console.log(`\nGiorni analizzati: ${report.daysAnalyzed} | pranzi: ${report.lunchCount} | cene: ${report.dinnerCount}`);
    console.log(`Pasta/riso a pranzo: ${report.pastaRiceLunches}/${report.lunchCount}`);
    console.log(`Legumi (pranzi+cene): ${report.legumeMeals} (max 3)`);
    console.log(`Pesce (pranzi+cene): ${report.fishMeals} (min 2)`);
    console.log(`Slot senza verdure: ${report.missingVegetableSlots.length}`);

    if (report.balanced) {
      console.log('✅ Piano BILANCIATO secondo le soglie mediterranee.\n');
    } else {
      allBalanced = false;
      console.log('❌ SQUILIBRI RILEVATI:');
      for (const issue of report.issues) console.log(`   - ${issue}`);
      console.log('');
    }
  }

  process.exit(allBalanced ? 0 : 1);
}

main().catch((err) => {
  console.error('Errore durante la valutazione:', err);
  process.exit(1);
});
