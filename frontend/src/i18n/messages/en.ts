/**
 * English is the reference catalogue. Its shape becomes the `Messages` type, so
 * adding a key here and forgetting it in nl/de/fr is a compile error rather
 * than a missing string at runtime.
 */
const en = {
  meta: {
    title: 'FoodFacts Explorer',
    description: 'Search packaged food products and see what is really in them.',
  },
  nav: {
    home: 'Search',
    language: 'Language',
    subscribed: 'Subscribed',
    notSubscribed: 'Free plan',
    manageBilling: 'Manage subscription',
  },
  search: {
    heading: 'Find a packaged food product',
    subheading: 'Search by product name, brand, or category.',
    placeholder: 'e.g. chocolate cereal, olive oil, oat milk',
    submit: 'Search',
    searching: 'Searching…',
    resultsFor: 'Results for “{term}”',
    resultCount: '{count} products found',
    noResults: 'Nothing matched “{term}”.',
    noResultsHint: 'Try a shorter term, or search in another language.',
    emptyState: 'Type a product name above to get started.',
    error: 'The search could not be completed.',
    tooShort: 'Enter at least two characters.',
  },
  recent: {
    heading: 'Recent searches',
    empty: 'Your recent searches will appear here.',
    clear: 'Clear',
    cleared: 'History cleared.',
    resultCount: '{count} results',
  },
  product: {
    backToSearch: 'Back to search',
    noName: 'Unnamed product',
    noBrand: 'Brand unknown',
    noImage: 'No photo available',
    quantity: 'Quantity',
    categories: 'Categories',
    labels: 'Labels',
    countries: 'Sold in',
    ingredients: 'Ingredients',
    noIngredients: 'No ingredient list has been contributed for this product.',
    barcode: 'Barcode',
    notFound: 'That product could not be found.',
    notFoundHint: 'It may not exist in Open Food Facts yet.',
    incomplete: 'This entry is incomplete — Open Food Facts is community-maintained.',
    translatedFrom: 'Shown in {language}; no {requested} version has been contributed.',
    completeness: '{percent}% complete',
  },
  nutrition: {
    heading: 'Nutrition',
    per100g: 'Per 100 g / 100 ml',
    servingSize: 'Serving size',
    nutriScore: 'Nutri-Score',
    novaGroup: 'NOVA group',
    ecoScore: 'Eco-Score',
    unavailable: 'No nutritional data has been contributed for this product.',
    locked: 'Nutritional details are part of the subscription',
    lockedBody:
      'Product name, brand, and photo stay free. Subscribe to see energy, fat, sugars, salt, and the Nutri-Score.',
    nutrients: {
      energyKcal: 'Energy',
      fat: 'Fat',
      saturatedFat: 'of which saturates',
      carbohydrates: 'Carbohydrates',
      sugars: 'of which sugars',
      fiber: 'Fibre',
      proteins: 'Protein',
      salt: 'Salt',
      sodium: 'Sodium',
    },
    novaLabels: {
      '1': 'Unprocessed or minimally processed',
      '2': 'Processed culinary ingredient',
      '3': 'Processed food',
      '4': 'Ultra-processed food',
    },
  },
  billing: {
    subscribe: 'Subscribe — €4.99/month',
    subscribing: 'Opening checkout…',
    error: 'Checkout could not be started.',
    alreadySubscribed: 'You already have an active subscription.',
    successTitle: 'Subscription active',
    successBody:
      'Thanks. Nutritional details are unlocked. It can take a few seconds for the confirmation from Stripe to arrive.',
    successCta: 'Back to search',
    cancelTitle: 'Checkout cancelled',
    cancelBody: 'No payment was taken. You can subscribe whenever you like.',
    cancelCta: 'Back to search',
    testCardHint: 'Test mode: pay with card 4242 4242 4242 4242, any future date, any CVC.',
    renewsOn: 'Renews on {date}',
    endsOn: 'Access ends on {date}',
  },
  errors: {
    generic: 'Something went wrong.',
    backendUnreachable: 'The API is not responding. Is the backend running on port 4000?',
    retry: 'Try again',
  },
} as const;

export default en;

/**
 * `as const` above pins the *keys* so a catalogue cannot silently miss one, but
 * it also pins every value to its literal type — which would demand that the
 * German file contain the English words. Widen recurses through the structure
 * turning each string literal back into `string`, keeping the key check and
 * dropping the value check.
 */
type Widen<T> = T extends string
  ? string
  : { [K in keyof T]: Widen<T[K]> };

/** The shape every other catalogue must match. */
export type Messages = Widen<typeof en>;
