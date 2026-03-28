import {
  BadRequestException,
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UserFromJwt } from '../auth/interfaces/auth.interfaces';
import { UpdateRoleDto } from './dto/update-role.dto';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { CreateCityDto } from '../cities/dto/create-city.dto';
import { UpdateCityDto } from '../cities/dto/update-city.dto';
import { CreateCategoryDto } from '../categories/dto/create-category.dto';
import { UpdateCategoryDto } from '../categories/dto/update-category.dto';
import {
  SendTestEmailDto,
  UpdateEmailSettingsDto,
} from './dto/update-email-settings.dto';
import type { SaveEmailSettingsInput } from '../email/email-settings.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // --- Users ---
  @Get('users')
  getUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  @Get('users/:id/governance-history')
  getUserGovernanceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserGovernanceHistory(id);
  }

  // ... (methods)

  // ...

  @Post('users/:id/grant')
  grantRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.adminService.grantRole(id, dto.role, req.user.userId);
  }

  @Post('users/:id/revoke')
  revokeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.adminService.revokeRole(id, dto.role, req.user.userId);
  }

  @Patch('users/:id/activate')
  activateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.adminService.activateUser(id, req.user.userId);
  }

  @Patch('users/:id/block')
  blockUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.adminService.blockUser(id, req.user.userId);
  }

  @Post('users/:id/grant/provider')
  grantProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.adminService.grantProvider(id, req.user.userId);
  }

  @Post('users/:id/grant/runner')
  grantRunner(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.adminService.grantRunner(id, req.user.userId);
  }

  // --- Cities ---
  @Get('cities')
  getCities() {
    return this.adminService.getAllCities();
  }

  @Post('cities')
  createCity(@Body() body: CreateCityDto) {
    return this.adminService.createCity(body);
  }

  @Patch('cities/:id')
  updateCity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCityDto,
  ) {
    return this.adminService.updateCity(id, body);
  }

  @Delete('cities/:id')
  deleteCity(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteCity(id);
  }

  // --- Categories ---
  @Get('categories')
  getCategories() {
    return this.adminService.getAllCategories();
  }

  @Post('categories')
  createCategory(@Body() body: CreateCategoryDto) {
    return this.adminService.createCategory(body);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.adminService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteCategory(id);
  }

  @Get('email-settings')
  getEmailSettings(@Request() req: ExpressRequest) {
    this.assertSecureEmailAdminRequest(req);
    return this.adminService.getEmailSettings();
  }

  @Patch('email-settings')
  updateEmailSettings(
    @Body() body: UpdateEmailSettingsDto,
    @Request() req: ExpressRequest & { user: UserFromJwt },
  ) {
    this.assertSecureEmailAdminRequest(req);
    return this.adminService.updateEmailSettings(
      body as SaveEmailSettingsInput,
      req.user.userId,
    );
  }

  @Post('email-settings/test')
  sendEmailSettingsTest(
    @Body() body: SendTestEmailDto,
    @Request() req: ExpressRequest,
  ) {
    this.assertSecureEmailAdminRequest(req);
    return this.adminService.sendEmailSettingsTest(body.recipient);
  }

  @Get('refunds')
  getRefunds() {
    return this.adminService.getRecentRefunds();
  }

  @Get('incidents')
  getIncidents() {
    return this.adminService.getRecentIncidents();
  }

  // --- Metrics ---
  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }

  private assertSecureEmailAdminRequest(req: ExpressRequest) {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const forwardedProtoHeader = req.headers['x-forwarded-proto'];
    const forwardedProto = Array.isArray(forwardedProtoHeader)
      ? forwardedProtoHeader[0]
      : forwardedProtoHeader;
    const protocol = forwardedProto?.split(',')[0]?.trim() || req.protocol;

    if (protocol !== 'https') {
      throw new BadRequestException(
        'Email connector settings require an HTTPS admin session',
      );
    }
  }
}
