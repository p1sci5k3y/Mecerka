import { Module, Global } from '@nestjs/common';
import { EmailSettingsService } from './email-settings.service';
import { EmailService } from './email.service';

@Global()
@Module({
  providers: [EmailService, EmailSettingsService],
  exports: [EmailService, EmailSettingsService],
})
export class EmailModule {}
