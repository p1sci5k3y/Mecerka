import { Injectable } from '@nestjs/common';
import { CreateCityDto } from './dto/create-city.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CitiesService {
  constructor(private prisma: PrismaService) {}

  create(createCityDto: CreateCityDto) {
    return this.prisma.city.create({
      data: createCityDto,
    });
  }

  findAll() {
    return this.prisma.city.findMany({
      where: { active: true },
    });
  }
}
