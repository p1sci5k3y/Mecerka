import {
  Controller,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { RunnerService } from './runner.service';
import { PreviewDeliveryDto } from './dto/preview-delivery.dto';
import { SelectRunnerDto } from './dto/select-runner.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RunnerController {
  constructor(private readonly runnerService: RunnerService) {}

  @Post('preview-delivery')
  @Roles(Role.CLIENT, Role.ADMIN)
  async previewDelivery(@Body() dto: PreviewDeliveryDto) {
    return this.runnerService.previewDelivery(dto);
  }

  @Post(':id/select-runner')
  @Roles(Role.CLIENT, Role.ADMIN)
  async selectRunner(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SelectRunnerDto,
  ) {
    return this.runnerService.selectRunner(id, dto);
  }
}
