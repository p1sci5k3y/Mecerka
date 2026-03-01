import { IsUUID, IsNotEmpty } from 'class-validator';

export class SelectRunnerDto {
  @IsUUID()
  @IsNotEmpty()
  runnerId: string;
}
