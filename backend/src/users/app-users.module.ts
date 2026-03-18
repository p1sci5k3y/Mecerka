import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersService } from './users.service';
import { IsSpanishFiscalIdConstraint } from './validators/is-spanish-fiscal-id.validator';
import { RoleAssignmentService } from './role-assignment.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, RoleAssignmentService, IsSpanishFiscalIdConstraint],
  exports: [UsersService, RoleAssignmentService],
})
export class UsersModule {}
