import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogImportService } from './catalog-import.service';
import { CatalogFileParser } from './catalog-file.parser';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsService, CatalogImportService, CatalogFileParser],
  exports: [ProductsService],
})
export class ProductsModule {}
