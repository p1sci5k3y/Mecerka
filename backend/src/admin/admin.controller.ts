import {
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

  // --- Metrics ---
  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }
}
