import { IsUUID } from 'class-validator';

export class AssignDeliveryRunnerDto {
  @IsUUID()
  runnerId!: string;
}
