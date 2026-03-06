import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@meceka.local';
  
  // 1. Generate token
  const resetToken = 'test-token-123';
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  
  await prisma.user.update({
    where: { email },
    data: { resetPasswordToken: resetToken, resetPasswordExpiresAt: expiresAt }
  });
  console.log("Token set.");
  
  // 2. Fetch User by token
  const user = await prisma.user.findUnique({ where: { resetPasswordToken: resetToken } });
  console.log("User by token:", !!user);
  
  // 3. Update to clear
  await prisma.user.update({
    where: { id: user!.id },
    data: {
      password: "hashed",
      resetPasswordToken: null,
      resetPasswordExpiresAt: null,
    } as any,
  });
  console.log("Token cleared.");
  
  // 4. Fetch User by token again
  const user2 = await prisma.user.findUnique({ where: { resetPasswordToken: resetToken } });
  console.log("User by token again:", !!user2);
}

main().catch(console.error).finally(() => prisma.$disconnect());
