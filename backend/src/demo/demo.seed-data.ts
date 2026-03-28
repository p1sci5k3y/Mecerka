import type { DemoUserSeed } from './demo-user-bootstrap.service';

export type DemoCitySeed = {
  name: string;
  slug: string;
  postalCode: string;
  centerLat: number;
  centerLng: number;
};

export type DemoProviderSeed = {
  email: string;
  name: string;
  citySlug: string;
  address: string;
  latitude: number;
  longitude: number;
  providerServiceRadiusKm: number;
  paymentAccountId: string;
  products: Array<{
    name: string;
    price: number;
    stock: number;
    categorySlug: string;
    imageFilename: string;
    description: string;
  }>;
};

export type DemoRunnerSeed = {
  email: string;
  name: string;
  citySlug: string;
  paymentAccountId: string;
  baseLat: number;
  baseLng: number;
  maxDistanceKm: number;
  priceBase: number;
  pricePerKm: number;
  minFee: number;
};

export type DemoProductSeed = {
  name: string;
  price: number;
  stock: number;
  providerEmail: string;
  citySlug: string;
  categorySlug: string;
  imageFilename: string;
  description: string;
};

export type DemoOrderScenarioSeed = {
  key: string;
  clientEmail: string;
  citySlug: string;
  deliveryAddress: string;
  postalCode: string;
  addressReference?: string;
  items: Array<{ productName: string; quantity: number }>;
  lifecycle: 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'SUPPORT';
  runnerEmail?: string;
  location?: { latitude: number; longitude: number };
  deliveryNotes?: string;
};

export type DemoDatasetStatus = {
  users: number;
  products: number;
  orders: number;
  deliveries: number;
};

export const DEMO_EMAIL_DOMAIN = '@local.test';
export const DEMO_SHARED_PASSWORD = 'DemoPass123!';

export const DEMO_CITIES: DemoCitySeed[] = [
  {
    name: 'Toledo',
    slug: 'toledo',
    postalCode: '45001',
    centerLat: 39.8569,
    centerLng: -4.0245,
  },
  {
    name: 'Madrid',
    slug: 'madrid',
    postalCode: '28013',
    centerLat: 40.4168,
    centerLng: -3.7038,
  },
  {
    name: 'Valencia',
    slug: 'valencia',
    postalCode: '46003',
    centerLat: 39.4699,
    centerLng: -0.3763,
  },
  {
    name: 'Sevilla',
    slug: 'sevilla',
    postalCode: '41004',
    centerLat: 37.3891,
    centerLng: -5.9845,
  },
  {
    name: 'Bilbao',
    slug: 'bilbao',
    postalCode: '48005',
    centerLat: 43.2596,
    centerLng: -2.9239,
  },
];

export const DEMO_CATEGORIES = [
  {
    name: 'Panadería',
    slug: 'panaderia',
    image_url: '/demo-products/bread.jpg',
  },
  {
    name: 'Despensa',
    slug: 'despensa',
    image_url: '/demo-products/olive-oil.jpg',
  },
  {
    name: 'Cerámica',
    slug: 'ceramica',
    image_url: '/demo-products/ceramica-artesanal.svg',
  },
  {
    name: 'Papelería',
    slug: 'papeleria',
    image_url: '/demo-products/cuadernos-artesanales.svg',
  },
  {
    name: 'Textil',
    slug: 'textil',
    image_url: '/demo-products/textil-artesanal.svg',
  },
  {
    name: 'Cuero',
    slug: 'cuero',
    image_url: '/demo-products/cuero-artesanal.svg',
  },
  {
    name: 'Velas',
    slug: 'velas',
    image_url: '/demo-products/velas-artesanales.svg',
  },
  {
    name: 'Flores',
    slug: 'flores',
    image_url: '/demo-products/flores-locales.svg',
  },
  {
    name: 'Café',
    slug: 'cafe',
    image_url: '/demo-products/cafe-local.svg',
  },
] as const;

export const DEMO_PROVIDER_SEEDS: DemoProviderSeed[] = [
  {
    email: 'provider.demo@local.test',
    name: 'Panadería San Isidro',
    citySlug: 'toledo',
    address: 'Plaza de Zocodover, 1, Toledo',
    latitude: 39.8569,
    longitude: -4.0245,
    providerServiceRadiusKm: 8,
    paymentAccountId: 'acct_demo_toledo_provider_1',
    products: [
      {
        name: 'Pan artesano',
        price: 2.5,
        stock: 30,
        categorySlug: 'panaderia',
        imageFilename: 'bread.jpg',
        description: 'Hogaza artesanal para pedidos de demo.',
      },
      {
        name: 'Empanada gallega',
        price: 6.9,
        stock: 20,
        categorySlug: 'panaderia',
        imageFilename: 'empanada.jpg',
        description: 'Empanada lista para probar el flujo de compra.',
      },
      {
        name: 'Magdalenas del obrador',
        price: 4.2,
        stock: 18,
        categorySlug: 'panaderia',
        imageFilename: 'bread.jpg',
        description: 'Caja pequeña de magdalenas artesanas.',
      },
      {
        name: 'Rosquillas de anís',
        price: 3.8,
        stock: 22,
        categorySlug: 'panaderia',
        imageFilename: 'bread.jpg',
        description: 'Rosquillas tiernas para desayuno o merienda.',
      },
      {
        name: 'Miel de azahar local',
        price: 7.5,
        stock: 14,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Tarro de miel local para ampliar la despensa demo.',
      },
    ],
  },
  {
    email: 'provider2.demo@local.test',
    name: 'Cerámica del Miradero',
    citySlug: 'toledo',
    address: 'Calle Comercio, 4, Toledo',
    latitude: 39.8586,
    longitude: -4.0226,
    providerServiceRadiusKm: 8,
    paymentAccountId: 'acct_demo_toledo_provider_2',
    products: [
      {
        name: 'Cuenco de cerámica toledana',
        price: 18.5,
        stock: 12,
        categorySlug: 'ceramica',
        imageFilename: 'ceramica-artesanal.svg',
        description: 'Pieza utilitaria para el circuito artesanal demo.',
      },
      {
        name: 'Jarra vidriada',
        price: 24.0,
        stock: 10,
        categorySlug: 'ceramica',
        imageFilename: 'ceramica-artesanal.svg',
        description: 'Jarra de barro vidriado hecha a mano.',
      },
      {
        name: 'Plato de barro',
        price: 16.0,
        stock: 15,
        categorySlug: 'ceramica',
        imageFilename: 'ceramica-artesanal.svg',
        description: 'Plato artesanal para mesa o decoración.',
      },
      {
        name: 'Taza esmaltada',
        price: 14.5,
        stock: 16,
        categorySlug: 'ceramica',
        imageFilename: 'ceramica-artesanal.svg',
        description: 'Taza robusta para pedidos demo de artesanía local.',
      },
      {
        name: 'Azulejo decorativo',
        price: 11.5,
        stock: 20,
        categorySlug: 'ceramica',
        imageFilename: 'ceramica-artesanal.svg',
        description: 'Azulejo con patrón tradicional para pruebas demo.',
      },
    ],
  },
  {
    email: 'madrid.provider.demo@local.test',
    name: 'Flores de la Plaza',
    citySlug: 'madrid',
    address: 'Calle Mayor, 16, Madrid',
    latitude: 40.4164,
    longitude: -3.7062,
    providerServiceRadiusKm: 9,
    paymentAccountId: 'acct_demo_madrid_provider_1',
    products: [
      {
        name: 'Ramo de temporada',
        price: 22.0,
        stock: 14,
        categorySlug: 'flores',
        imageFilename: 'flores-locales.svg',
        description: 'Ramo fresco para mostrar compra local no alimentaria.',
      },
      {
        name: 'Centro floral pequeño',
        price: 28.0,
        stock: 10,
        categorySlug: 'flores',
        imageFilename: 'flores-locales.svg',
        description: 'Centro floral pensado para pruebas de delivery urbano.',
      },
      {
        name: 'Planta aromática',
        price: 9.5,
        stock: 18,
        categorySlug: 'flores',
        imageFilename: 'flores-locales.svg',
        description: 'Maceta de albahaca o hierbabuena para cesta local.',
      },
      {
        name: 'Ramo seco decorativo',
        price: 18.0,
        stock: 11,
        categorySlug: 'flores',
        imageFilename: 'flores-locales.svg',
        description: 'Alternativa duradera para la demo de comercio local.',
      },
      {
        name: 'Corona mini artesanal',
        price: 16.0,
        stock: 8,
        categorySlug: 'flores',
        imageFilename: 'flores-locales.svg',
        description: 'Pieza floral pequeña para regalo o mesa.',
      },
    ],
  },
  {
    email: 'madrid.crafts.demo@local.test',
    name: 'Cuadernos de Malasaña',
    citySlug: 'madrid',
    address: 'Calle Espíritu Santo, 8, Madrid',
    latitude: 40.4251,
    longitude: -3.7031,
    providerServiceRadiusKm: 9,
    paymentAccountId: 'acct_demo_madrid_provider_2',
    products: [
      {
        name: 'Cuaderno cosido a mano',
        price: 13.5,
        stock: 20,
        categorySlug: 'papeleria',
        imageFilename: 'cuadernos-artesanales.svg',
        description: 'Cuaderno artesanal de producción local.',
      },
      {
        name: 'Agenda ilustrada',
        price: 18.0,
        stock: 14,
        categorySlug: 'papeleria',
        imageFilename: 'cuadernos-artesanales.svg',
        description: 'Agenda con cubierta ilustrada para la demo.',
      },
      {
        name: 'Estuche de tela',
        price: 11.0,
        stock: 17,
        categorySlug: 'papeleria',
        imageFilename: 'cuadernos-artesanales.svg',
        description: 'Estuche textil para material de escritorio.',
      },
      {
        name: 'Lámina tipográfica',
        price: 9.5,
        stock: 25,
        categorySlug: 'papeleria',
        imageFilename: 'cuadernos-artesanales.svg',
        description: 'Lámina decorativa para la superficie de regalo.',
      },
      {
        name: 'Postal serigrafiada',
        price: 4.2,
        stock: 40,
        categorySlug: 'papeleria',
        imageFilename: 'cuadernos-artesanales.svg',
        description: 'Postal local para compras pequeñas y upsell demo.',
      },
    ],
  },
  {
    email: 'valencia.provider.demo@local.test',
    name: 'Huerta del Turia',
    citySlug: 'valencia',
    address: 'Carrer de la Bosseria, 6, Valencia',
    latitude: 39.4742,
    longitude: -0.3783,
    providerServiceRadiusKm: 9,
    paymentAccountId: 'acct_demo_valencia_provider_1',
    products: [
      {
        name: 'Naranjas dulces',
        price: 5.5,
        stock: 35,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Caja pequeña de naranjas valencianas.',
      },
      {
        name: 'Tomates de huerta',
        price: 3.9,
        stock: 28,
        categorySlug: 'despensa',
        imageFilename: 'tomatoes.jpg',
        description: 'Tomate de proximidad para cesta demo.',
      },
      {
        name: 'Arroz de la Albufera',
        price: 6.4,
        stock: 24,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Arroz local para reforzar el catálogo alimentario.',
      },
      {
        name: 'Horchata concentrada',
        price: 4.8,
        stock: 20,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Botella de horchata para pedidos demo de verano.',
      },
      {
        name: 'Almendras tostadas',
        price: 7.2,
        stock: 22,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Fruto seco local para ampliar variedad de despensa.',
      },
    ],
  },
  {
    email: 'valencia.crafts.demo@local.test',
    name: 'Seda del Carmen',
    citySlug: 'valencia',
    address: 'Carrer de la Pau, 21, Valencia',
    latitude: 39.474,
    longitude: -0.3729,
    providerServiceRadiusKm: 9,
    paymentAccountId: 'acct_demo_valencia_provider_2',
    products: [
      {
        name: 'Pañuelo de seda',
        price: 26.0,
        stock: 12,
        categorySlug: 'textil',
        imageFilename: 'textil-artesanal.svg',
        description: 'Pañuelo estampado para el bloque textil de la demo.',
      },
      {
        name: 'Bolsa bordada',
        price: 22.5,
        stock: 15,
        categorySlug: 'textil',
        imageFilename: 'textil-artesanal.svg',
        description: 'Bolsa textil local con bordado sencillo.',
      },
      {
        name: 'Camino de mesa mediterráneo',
        price: 19.0,
        stock: 11,
        categorySlug: 'textil',
        imageFilename: 'textil-artesanal.svg',
        description: 'Textil para hogar con lenguaje visual mediterráneo.',
      },
      {
        name: 'Cojín valenciano',
        price: 18.5,
        stock: 14,
        categorySlug: 'textil',
        imageFilename: 'textil-artesanal.svg',
        description: 'Cojín artesanal para ampliar hogar y decoración.',
      },
      {
        name: 'Neceser textil',
        price: 12.0,
        stock: 19,
        categorySlug: 'textil',
        imageFilename: 'textil-artesanal.svg',
        description: 'Accesorio pequeño útil para pruebas de ticket medio.',
      },
    ],
  },
  {
    email: 'sevilla.provider.demo@local.test',
    name: 'Despensa de Triana',
    citySlug: 'sevilla',
    address: 'Calle Pureza, 24, Sevilla',
    latitude: 37.3851,
    longitude: -6.0012,
    providerServiceRadiusKm: 9,
    paymentAccountId: 'acct_demo_sevilla_provider_1',
    products: [
      {
        name: 'Pan de masa madre sevillano',
        price: 3.4,
        stock: 24,
        categorySlug: 'panaderia',
        imageFilename: 'bread.jpg',
        description: 'Pan local para ampliar el abanico alimentario demo.',
      },
      {
        name: 'Aceitunas aliñadas',
        price: 5.2,
        stock: 26,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Tarro de aceitunas para cesta rápida de proximidad.',
      },
      {
        name: 'Mermelada de naranja amarga',
        price: 6.6,
        stock: 18,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Conserva local para enriquecer el surtido demo.',
      },
      {
        name: 'Especias del barrio',
        price: 4.9,
        stock: 23,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Mezcla aromática de pequeño comercio.',
      },
      {
        name: 'Galletas de canela',
        price: 4.3,
        stock: 21,
        categorySlug: 'panaderia',
        imageFilename: 'bread.jpg',
        description: 'Galletas locales para compra impulsiva demo.',
      },
    ],
  },
  {
    email: 'sevilla.crafts.demo@local.test',
    name: 'Marroquinería Giralda',
    citySlug: 'sevilla',
    address: 'Calle Francos, 18, Sevilla',
    latitude: 37.3899,
    longitude: -5.9928,
    providerServiceRadiusKm: 9,
    paymentAccountId: 'acct_demo_sevilla_provider_2',
    products: [
      {
        name: 'Cartera de piel',
        price: 34.0,
        stock: 9,
        categorySlug: 'cuero',
        imageFilename: 'cuero-artesanal.svg',
        description: 'Cartera artesanal para mostrar ticket medio mayor.',
      },
      {
        name: 'Monedero artesanal',
        price: 18.0,
        stock: 14,
        categorySlug: 'cuero',
        imageFilename: 'cuero-artesanal.svg',
        description: 'Monedero pequeño de confección local.',
      },
      {
        name: 'Cinturón de cuero',
        price: 28.0,
        stock: 10,
        categorySlug: 'cuero',
        imageFilename: 'cuero-artesanal.svg',
        description: 'Cinturón sobrio para catálogo no alimentario.',
      },
      {
        name: 'Funda para gafas',
        price: 16.5,
        stock: 18,
        categorySlug: 'cuero',
        imageFilename: 'cuero-artesanal.svg',
        description: 'Funda artesanal para compras ligeras.',
      },
      {
        name: 'Bolso pequeño',
        price: 39.0,
        stock: 7,
        categorySlug: 'cuero',
        imageFilename: 'cuero-artesanal.svg',
        description: 'Bolso compacto de marroquinería local.',
      },
    ],
  },
  {
    email: 'bilbao.provider.demo@local.test',
    name: 'Café Casco Viejo',
    citySlug: 'bilbao',
    address: 'Calle Somera, 18, Bilbao',
    latitude: 43.2586,
    longitude: -2.9234,
    providerServiceRadiusKm: 9,
    paymentAccountId: 'acct_demo_bilbao_provider_1',
    products: [
      {
        name: 'Café de tueste local',
        price: 8.5,
        stock: 20,
        categorySlug: 'cafe',
        imageFilename: 'cafe-local.svg',
        description: 'Paquete de café para el bloque urbano de Bilbao.',
      },
      {
        name: 'Chocolate artesano',
        price: 6.8,
        stock: 18,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Tableta local para ampliar variedad gourmet.',
      },
      {
        name: 'Granola vasca',
        price: 5.7,
        stock: 17,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Desayuno seco listo para el catálogo demo.',
      },
      {
        name: 'Té ahumado',
        price: 7.1,
        stock: 16,
        categorySlug: 'cafe',
        imageFilename: 'cafe-local.svg',
        description: 'Alternativa caliente para ampliar el mix del local.',
      },
      {
        name: 'Conserva gourmet',
        price: 9.2,
        stock: 12,
        categorySlug: 'despensa',
        imageFilename: 'despensa-local.svg',
        description: 'Conserva de pequeño comercio para cesta premium.',
      },
    ],
  },
  {
    email: 'bilbao.crafts.demo@local.test',
    name: 'Velas de Bilbao',
    citySlug: 'bilbao',
    address: 'Calle Tendería, 10, Bilbao',
    latitude: 43.2598,
    longitude: -2.9247,
    providerServiceRadiusKm: 9,
    paymentAccountId: 'acct_demo_bilbao_provider_2',
    products: [
      {
        name: 'Vela de soja ámbar',
        price: 15.0,
        stock: 18,
        categorySlug: 'velas',
        imageFilename: 'velas-artesanales.svg',
        description: 'Vela aromática para el bloque hogar demo.',
      },
      {
        name: 'Vela marino norte',
        price: 16.5,
        stock: 14,
        categorySlug: 'velas',
        imageFilename: 'velas-artesanales.svg',
        description: 'Fragancia inspirada en paseo costero y comercio local.',
      },
      {
        name: 'Vela cítrica',
        price: 14.0,
        stock: 19,
        categorySlug: 'velas',
        imageFilename: 'velas-artesanales.svg',
        description: 'Pieza ligera para ticket pequeño de regalo.',
      },
      {
        name: 'Vela lavanda',
        price: 14.5,
        stock: 17,
        categorySlug: 'velas',
        imageFilename: 'velas-artesanales.svg',
        description: 'Formato clásico para la demo de hogar local.',
      },
      {
        name: 'Set de velas mini',
        price: 12.0,
        stock: 22,
        categorySlug: 'velas',
        imageFilename: 'velas-artesanales.svg',
        description: 'Set pequeño para compras impulsivas en demo.',
      },
    ],
  },
];

export const DEMO_RUNNER_SEEDS: DemoRunnerSeed[] = [
  {
    email: 'runner.demo@local.test',
    name: 'Runner Toledo Centro',
    citySlug: 'toledo',
    paymentAccountId: 'acct_demo_toledo_runner_1',
    baseLat: 39.8574,
    baseLng: -4.025,
    maxDistanceKm: 10,
    priceBase: 2.4,
    pricePerKm: 0.7,
    minFee: 3.5,
  },
  {
    email: 'runner2.demo@local.test',
    name: 'Runner Toledo Norte',
    citySlug: 'toledo',
    paymentAccountId: 'acct_demo_toledo_runner_2',
    baseLat: 39.8591,
    baseLng: -4.0209,
    maxDistanceKm: 10,
    priceBase: 2.6,
    pricePerKm: 0.72,
    minFee: 3.7,
  },
  {
    email: 'madrid.runner.demo@local.test',
    name: 'Runner Madrid Centro',
    citySlug: 'madrid',
    paymentAccountId: 'acct_demo_madrid_runner_1',
    baseLat: 40.4174,
    baseLng: -3.7042,
    maxDistanceKm: 12,
    priceBase: 2.8,
    pricePerKm: 0.75,
    minFee: 4,
  },
  {
    email: 'valencia.runner.demo@local.test',
    name: 'Runner Valencia Centro',
    citySlug: 'valencia',
    paymentAccountId: 'acct_demo_valencia_runner_1',
    baseLat: 39.4704,
    baseLng: -0.3767,
    maxDistanceKm: 12,
    priceBase: 2.7,
    pricePerKm: 0.72,
    minFee: 3.9,
  },
  {
    email: 'sevilla.runner.demo@local.test',
    name: 'Runner Sevilla Centro',
    citySlug: 'sevilla',
    paymentAccountId: 'acct_demo_sevilla_runner_1',
    baseLat: 37.3894,
    baseLng: -5.9862,
    maxDistanceKm: 12,
    priceBase: 2.8,
    pricePerKm: 0.76,
    minFee: 4,
  },
  {
    email: 'bilbao.runner.demo@local.test',
    name: 'Runner Bilbao Casco Viejo',
    citySlug: 'bilbao',
    paymentAccountId: 'acct_demo_bilbao_runner_1',
    baseLat: 43.2592,
    baseLng: -2.9243,
    maxDistanceKm: 12,
    priceBase: 2.9,
    pricePerKm: 0.78,
    minFee: 4.1,
  },
];

export const DEMO_USERS: DemoUserSeed[] = [
  {
    email: 'admin.demo@local.test',
    name: 'Admin Demo',
    kind: 'ADMIN',
  },
  ...DEMO_PROVIDER_SEEDS.map((provider) => ({
    email: provider.email,
    name: provider.name,
    kind: 'PROVIDER' as const,
    citySlug: provider.citySlug,
  })),
  ...DEMO_RUNNER_SEEDS.map((runner) => ({
    email: runner.email,
    name: runner.name,
    kind: 'RUNNER' as const,
    citySlug: runner.citySlug,
  })),
  {
    email: 'user.demo@local.test',
    name: 'Usuario Demo 1',
    kind: 'USER',
  },
  {
    email: 'user2.demo@local.test',
    name: 'Usuario Demo 2',
    kind: 'USER',
  },
];

export const DEMO_PRODUCTS: DemoProductSeed[] = DEMO_PROVIDER_SEEDS.flatMap(
  (provider) =>
    provider.products.map((product) => ({
      ...product,
      providerEmail: provider.email,
      citySlug: provider.citySlug,
    })),
);

export const DEMO_ORDER_SCENARIOS: DemoOrderScenarioSeed[] = [
  {
    key: 'toledo-pending-marketplace',
    clientEmail: 'user.demo@local.test',
    citySlug: 'toledo',
    deliveryAddress: 'Calle Hombre de Palo, 7',
    postalCode: '45001',
    addressReference: 'Portal azul',
    items: [
      { productName: 'Pan artesano', quantity: 2 },
      { productName: 'Cuenco de cerámica toledana', quantity: 1 },
    ],
    lifecycle: 'PENDING',
  },
  {
    key: 'madrid-delivering-bouquet',
    clientEmail: 'user.demo@local.test',
    citySlug: 'madrid',
    deliveryAddress: 'Calle Mayor, 12',
    postalCode: '28013',
    items: [
      { productName: 'Ramo de temporada', quantity: 1 },
      { productName: 'Planta aromática', quantity: 1 },
    ],
    lifecycle: 'IN_TRANSIT',
    runnerEmail: 'madrid.runner.demo@local.test',
    location: {
      latitude: 40.4171,
      longitude: -3.7051,
    },
  },
  {
    key: 'valencia-delivered-huerta',
    clientEmail: 'user2.demo@local.test',
    citySlug: 'valencia',
    deliveryAddress: 'Carrer de la Pau, 21',
    postalCode: '46003',
    items: [
      { productName: 'Naranjas dulces', quantity: 1 },
      { productName: 'Arroz de la Albufera', quantity: 1 },
    ],
    lifecycle: 'DELIVERED',
    runnerEmail: 'valencia.runner.demo@local.test',
    location: {
      latitude: 39.4728,
      longitude: -0.3745,
    },
    deliveryNotes: 'Entrega demo completada en Valencia',
  },
  {
    key: 'sevilla-assigned-leather',
    clientEmail: 'user2.demo@local.test',
    citySlug: 'sevilla',
    deliveryAddress: 'Calle Francos, 33',
    postalCode: '41004',
    items: [{ productName: 'Cartera de piel', quantity: 1 }],
    lifecycle: 'ASSIGNED',
    runnerEmail: 'sevilla.runner.demo@local.test',
  },
  {
    key: 'bilbao-support-coffee',
    clientEmail: 'user.demo@local.test',
    citySlug: 'bilbao',
    deliveryAddress: 'Calle Somera, 24',
    postalCode: '48005',
    items: [
      { productName: 'Café de tueste local', quantity: 1 },
      { productName: 'Chocolate artesano', quantity: 1 },
    ],
    lifecycle: 'SUPPORT',
    runnerEmail: 'bilbao.runner.demo@local.test',
    location: {
      latitude: 43.2602,
      longitude: -2.9241,
    },
  },
];

export const DEMO_EXPECTED_ORDER_COUNT = DEMO_ORDER_SCENARIOS.length;
export const DEMO_EXPECTED_DELIVERY_COUNT = DEMO_ORDER_SCENARIOS.filter(
  (scenario) => scenario.lifecycle !== 'PENDING',
).length;
