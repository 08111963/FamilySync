import { getUncachableStripeClient } from '../server/lib/stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  console.log('Creazione prodotti FamilySync...');

  const existingProducts = await stripe.products.search({ query: "name:'FamilySync'" });
  if (existingProducts.data.length > 0) {
    console.log('Prodotti già esistenti, skip creazione');
    return;
  }

  const premiumProduct = await stripe.products.create({
    name: 'FamilySync Premium',
    description: 'Piano Premium per famiglie. Include tutte le funzionalità avanzate.',
    metadata: {
      features: 'calendario_illimitato,liste_condivise,ai_suggestions,sincronizzazione_real_time',
      tier: 'premium'
    }
  });

  console.log(`Prodotto creato: ${premiumProduct.id} - ${premiumProduct.name}`);

  const monthlyPrice = await stripe.prices.create({
    product: premiumProduct.id,
    unit_amount: 499,
    currency: 'eur',
    recurring: { interval: 'month' },
    metadata: {
      display_name: 'Mensile'
    }
  });

  console.log(`Prezzo mensile creato: ${monthlyPrice.id} - €${monthlyPrice.unit_amount! / 100}/mese`);

  const yearlyPrice = await stripe.prices.create({
    product: premiumProduct.id,
    unit_amount: 3999,
    currency: 'eur',
    recurring: { interval: 'year' },
    metadata: {
      display_name: 'Annuale',
      savings: '33%'
    }
  });

  console.log(`Prezzo annuale creato: ${yearlyPrice.id} - €${yearlyPrice.unit_amount! / 100}/anno`);

  console.log('\nProdotti e prezzi creati con successo!');
  console.log('\nRiepilogo:');
  console.log(`- Prodotto: ${premiumProduct.name} (${premiumProduct.id})`);
  console.log(`- Prezzo mensile: €4.99/mese (${monthlyPrice.id})`);
  console.log(`- Prezzo annuale: €39.99/anno (${yearlyPrice.id})`);
}

createProducts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Errore:', error);
    process.exit(1);
  });
