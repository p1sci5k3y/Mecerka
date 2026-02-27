import { IsInt, IsNotEmpty } from 'class-validator';

export class SelectRunnerDto {
  @IsInt()
  @IsNotEmpty()
  runnerId: number;
}
