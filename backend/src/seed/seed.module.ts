import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BaseSeedService } from './base-seed.service';

@Module({
  imports: [PrismaModule],
  providers: [BaseSeedService],
  exports: [BaseSeedService],
})
export class SeedModule {}
