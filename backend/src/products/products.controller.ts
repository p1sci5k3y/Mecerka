import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseUUIDPipe,
  Query,
  StreamableFile,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UserFromJwt } from '../auth/interfaces/auth.interfaces';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { CatalogImportService } from './catalog-import.service';
import { CatalogFormatQueryDto } from './dto/catalog-format-query.dto';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly catalogImportService: CatalogImportService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  create(
    @Body() createProductDto: CreateProductDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.productsService.create(createProductDto, req.user.userId);
  }

  @Get('my-products')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  findMyProducts(@Request() req: { user: UserFromJwt }) {
    return this.productsService.findMyProducts(req.user.userId);
  }

  @Post('catalog/imports/validate')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  validateCatalogImport(
    @UploadedFile()
    file: { originalname: string; mimetype?: string; buffer: Buffer },
    @Request() req: { user: UserFromJwt },
  ) {
    return this.catalogImportService.validateImport(req.user.userId, file);
  }

  @Post('catalog/imports/:jobId/apply')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  applyCatalogImport(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.catalogImportService.applyImport(req.user.userId, jobId);
  }

  @Get('catalog/imports/:jobId')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  getCatalogImportJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.catalogImportService.getImportJob(req.user.userId, jobId);
  }

  @Get('catalog/export')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  async exportCatalog(
    @Query() query: CatalogFormatQueryDto,
    @Request() req: { user: UserFromJwt },
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.catalogImportService.exportCatalog(
      req.user.userId,
      query.format,
    );

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );

    return new StreamableFile(file.buffer);
  }

  @Get('catalog/template')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  getCatalogTemplate(
    @Query() query: CatalogFormatQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = this.catalogImportService.exportTemplate(query.format);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );

    return new StreamableFile(file.buffer);
  }

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.productsService.update(id, updateProductDto, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.productsService.remove(id, req.user.userId);
  }
}
