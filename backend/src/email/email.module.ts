import { Module, Global } from '@nestjs/common';
import { EmailSettingsService } from './email-settings.service';
import { EmailService } from './email.service';
import { EmailSecretsCryptoService } from './email-secrets-crypto.service';

@Global()
@Module({
  providers: [EmailService, EmailSettingsService, EmailSecretsCryptoService],
  exports: [EmailService, EmailSettingsService, EmailSecretsCryptoService],
})
export class EmailModule {}
