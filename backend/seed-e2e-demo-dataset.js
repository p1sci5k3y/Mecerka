require('reflect-metadata');
require('./node_modules/ts-node/register');
require('./node_modules/tsconfig-paths/register');

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./src/app.module');
const { DemoService } = require('./src/demo/demo.service');
const { PrismaService } = require('./src/prisma/prisma.service');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const demoService = app.get(DemoService);
    const bootstrapAdminEmail =
      process.env.E2E_BOOTSTRAP_ADMIN_EMAIL || 'e2e-admin@example.test';

    const adminActor =
      (await prisma.user.findUnique({
        where: {
          email: bootstrapAdminEmail,
        },
        select: {
          id: true,
          email: true,
        },
      })) ||
      (await prisma.user.findUnique({
        where: {
          email: 'admin.demo@local.test',
        },
        select: {
          id: true,
          email: true,
        },
      }));

    if (!adminActor) {
      throw new Error('No admin actor available to reset demo dataset');
    }

    await demoService.reset(adminActor.id);
    console.log('[seed-e2e-demo-dataset] Reset demo dataset', {
      actor: adminActor.email,
    });
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('[seed-e2e-demo-dataset] Failed', { message });
  process.exit(1);
});
