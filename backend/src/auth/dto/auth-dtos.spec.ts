import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MagicLinkDto, VerifyMagicLinkDto } from './magic-link.dto';
import { ResetPasswordDto } from './reset-password.dto';

describe('auth DTOs', () => {
  it('accepts a valid email for magic-link and reset-password flows', async () => {
    const magicLinkDto = plainToInstance(MagicLinkDto, {
      email: 'user@example.com',
    });
    const resetPasswordDto = plainToInstance(ResetPasswordDto, {
      email: 'user@example.com',
    });

    await expect(validate(magicLinkDto)).resolves.toHaveLength(0);
    await expect(validate(resetPasswordDto)).resolves.toHaveLength(0);
  });

  it('rejects malformed emails and invalid verification tokens', async () => {
    const magicLinkDto = plainToInstance(MagicLinkDto, {
      email: 'not-an-email',
    });
    const resetPasswordDto = plainToInstance(ResetPasswordDto, {
      email: '',
    });
    const verifyMagicLinkDto = plainToInstance(VerifyMagicLinkDto, {
      token: 'short',
    });

    expect((await validate(magicLinkDto)).length).toBeGreaterThan(0);
    expect((await validate(resetPasswordDto)).length).toBeGreaterThan(0);
    expect((await validate(verifyMagicLinkDto)).length).toBeGreaterThan(0);
  });
});
