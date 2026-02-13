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
  ParseIntPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UserFromJwt } from '../auth/interfaces/auth.interfaces';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Patch('users/:id/role')
  updateUserRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.adminService.updateUserRole(id, dto.role, req.user.userId);
  }

  @Patch('users/:id/activate')
  activateUser(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.adminService.activateUser(id, req.user.userId);
  }

  @Patch('users/:id/block')
  blockUser(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.adminService.blockUser(id, req.user.userId);
  }

  // --- Cities ---
  @Get('cities')
  getCities() {
    return this.adminService.getAllCities();
  }

  @Post('cities')
  createCity(@Body() body: { name: string; slug: string; active?: boolean }) {
    return this.adminService.createCity(body);
  }

  @Patch('cities/:id')
  updateCity(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; slug?: string; active?: boolean },
  ) {
    return this.adminService.updateCity(id, body);
  }

  @Delete('cities/:id')
  deleteCity(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteCity(id);
  }

  // --- Categories ---
  @Get('categories')
  getCategories() {
    return this.adminService.getAllCategories();
  }

  @Post('categories')
  createCategory(
    @Body() body: { name: string; slug: string; image_url?: string },
  ) {
    return this.adminService.createCategory(body);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; slug?: string; image_url?: string },
  ) {
    return this.adminService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteCategory(id);
  }

  // --- Metrics ---
  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }
}
