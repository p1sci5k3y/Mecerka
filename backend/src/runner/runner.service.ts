import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PreviewDeliveryDto } from './dto/preview-delivery.dto';
import { SelectRunnerDto } from './dto/select-runner.dto';
import { OrderStatus, Role } from '@prisma/client';

@Injectable()
export class RunnerService {
  constructor(private readonly prisma: PrismaService) { }

  // Haversine formula to calculate distance in km
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
      Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async previewDelivery(dto: PreviewDeliveryDto) {
    // 1. Fetch active runners
    const runners = await this.prisma.runnerProfile.findMany({
      where: { isActive: true },
      include: { user: { select: { name: true, id: true } } },
    });

    // 2. Filter key logic (in-memory) & Calculate Fee
    const availableRunners = runners
      .map((runner) => {
        if (runner.baseLat === null || runner.baseLng === null) return null;

        const distance = this.calculateDistance(
          runner.baseLat,
          runner.baseLng,
          dto.lat,
          dto.lng,
        );

        if (distance > runner.maxDistanceKm) return null;

        // Fee logic: Base + (Dist * PerKm), never less than MinFee
        let fee =
          Number(runner.priceBase) + distance * Number(runner.pricePerKm);
        fee = Math.max(fee, Number(runner.minFee));

        return {
          runnerId: runner.userId, // Use userId as the public runner identifier
          name: runner.user.name,
          rating: Number(runner.ratingAvg),
          distanceKm: Number.parseFloat(distance.toFixed(2)),
          estimatedFee: Number.parseFloat(fee.toFixed(2)),
          etaMinutes: Math.ceil(distance * 6) + 10, // Mock: 10 mins base + 6 mins/km
        };
      })
      .filter((r) => r !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm || b.rating - a.rating); // Sort by Distance then Rating

    return availableRunners;
  }

  async selectRunner(
    orderId: number,
    dto: SelectRunnerDto,
    userId: number,
    roles: Role[],
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { city: true }, // Need city location later if we validate delivery vs runner base
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order must be PENDING to assign a runner');
    }

    if (!roles.includes(Role.ADMIN) && order.clientId !== userId) {
      throw new UnauthorizedException('Solo puedes asignar runners a tus propios pedidos');
    }

    const runner = await this.prisma.runnerProfile.findUnique({
      where: { userId: dto.runnerId },
    });

    if (!runner) throw new NotFoundException('Runner not found');
    if (!runner.isActive) throw new BadRequestException('Runner is not active');

    // Re-validate distance just in case (optional but safe)
    // For now assuming the preview was correct, but in real world we'd check order destination vs runner base

    // Transactional Update
    return this.prisma.$transaction(async (tx) => {
      // Re-fetch order inside transaction with pessimistic lock if needed, but simple update condition is sufficient
      const result = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING },
        data: {
          runnerId: runner.userId,
          status: OrderStatus.CONFIRMED,
          // Snapshot pricing & distance (Mock distance for now as order doesn't have lat/lng stored yet)
          // In real implementation, Order would have deliveryLat/Lng.
          // For this slice, we focus on the assignment mechanics.
          runnerBaseFee: runner.priceBase,
          runnerPerKmFee: runner.pricePerKm,
          deliveryDistanceKm: null, // Placeholder until Order has location
        },
      });

      if (result.count === 0) {
        throw new BadRequestException('The order is no longer available to be assigned.');
      }

      return tx.order.findUnique({ where: { id: orderId } });
    });
  }
}
