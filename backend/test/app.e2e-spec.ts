import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp } from './helpers/e2e-test-helpers';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterEach(async () => {
    await closeTestApp(app);
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
