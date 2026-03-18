import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@meceka.local';

  // 0. Verify User Existence
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (!existingUser) {
    console.error('Reset test target user not found');
    return;
  }

  // 1. Generate token
  const resetToken = 'test-token-123';
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.update({
    where: { email },
    data: { resetPasswordTokenHash: hashedToken, resetPasswordExpiresAt: expiresAt }
  });
  console.log("Token set.");

  // 2. Fetch User by token
  const user = await prisma.user.findUnique({ where: { resetPasswordTokenHash: hashedToken } });
  console.log("User by token:", !!user);

  // 3. Update to clear
  if (!user) {
    console.log("Token validation failed, user not found.");
    return;
  }

  const hashedPassword = await argon2.hash('NewPassword123!');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
      passwordChangedAt: new Date(),
    },
  });
  console.log("Token cleared.");

  // 4. Fetch User by token again
  const user2 = await prisma.user.findUnique({ where: { resetPasswordTokenHash: hashedToken } });
  console.log("User by token again:", !!user2);
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown reset error';
    console.error('Reset test failed', { message });
  })
  .finally(() => prisma.$disconnect());
