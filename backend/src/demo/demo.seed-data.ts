import type { DemoUserSeed } from './demo-user-bootstrap.service';

export type DemoProductSeed = {
  name: string;
  price: number;
  stock: number;
  providerEmail: string;
  categorySlug: string;
  imageFilename: string;
  description: string;
};

export type DemoDatasetStatus = {
  users: number;
  products: number;
  orders: number;
  deliveries: number;
};

export const DEMO_EMAIL_DOMAIN = '@local.test';

export const DEMO_CITY = {
  name: 'Toledo',
  slug: 'toledo',
} as const;

export const DEMO_CATEGORIES = [
  {
    name: 'Panadería',
    slug: 'panaderia',
    image_url: '/demo-products/bread.jpg',
  },
  {
    name: 'Verduras',
    slug: 'verduras',
    image_url: '/demo-products/tomatoes.jpg',
  },
  {
    name: 'Despensa',
    slug: 'despensa',
    image_url: '/demo-products/olive-oil.jpg',
  },
] as const;

export const DEMO_USERS: DemoUserSeed[] = [
  {
    email: 'admin.demo@local.test',
    name: 'Admin Demo',
    kind: 'ADMIN',
  },
  {
    email: 'provider.demo@local.test',
    name: 'Panadería San Isidro',
    kind: 'PROVIDER',
  },
  {
    email: 'provider2.demo@local.test',
    name: 'Verduras del Tajo',
    kind: 'PROVIDER',
  },
  {
    email: 'runner.demo@local.test',
    name: 'Runner Demo 1',
    kind: 'RUNNER',
  },
  {
    email: 'runner2.demo@local.test',
    name: 'Runner Demo 2',
    kind: 'RUNNER',
  },
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

export const DEMO_PRODUCTS: DemoProductSeed[] = [
  {
    name: 'Pan artesano',
    price: 2.5,
    stock: 30,
    providerEmail: 'provider.demo@local.test',
    categorySlug: 'panaderia',
    imageFilename: 'bread.jpg',
    description: 'Hogaza artesanal para pedidos de demo.',
  },
  {
    name: 'Empanada gallega',
    price: 6.9,
    stock: 20,
    providerEmail: 'provider.demo@local.test',
    categorySlug: 'panaderia',
    imageFilename: 'empanada.jpg',
    description: 'Empanada lista para probar el flujo de compra.',
  },
  {
    name: 'Tomates ecológicos',
    price: 3.2,
    stock: 40,
    providerEmail: 'provider2.demo@local.test',
    categorySlug: 'verduras',
    imageFilename: 'tomatoes.jpg',
    description: 'Tomates frescos para pedidos de demo.',
  },
  {
    name: 'Huevos camperos',
    price: 4.4,
    stock: 25,
    providerEmail: 'provider2.demo@local.test',
    categorySlug: 'despensa',
    imageFilename: 'eggs.jpg',
    description: 'Docena de huevos camperos de muestra.',
  },
  {
    name: 'Queso manchego',
    price: 8.75,
    stock: 18,
    providerEmail: 'provider2.demo@local.test',
    categorySlug: 'despensa',
    imageFilename: 'cheese.jpg',
    description: 'Queso manchego curado para la demo.',
  },
  {
    name: 'Aceite de oliva',
    price: 9.5,
    stock: 22,
    providerEmail: 'provider2.demo@local.test',
    categorySlug: 'despensa',
    imageFilename: 'olive-oil.jpg',
    description: 'Aceite de oliva virgen extra para pedidos demo.',
  },
];
