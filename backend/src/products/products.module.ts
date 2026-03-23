import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogImportService } from './catalog-import.service';
import { CatalogFileParser } from './catalog-file.parser';
import { ProductClientDiscountService } from './product-client-discount.service';
import { CatalogImportValidationService } from './catalog-import-validation.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    CatalogImportService,
    CatalogFileParser,
    CatalogImportValidationService,
    ProductClientDiscountService,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
