import { prisma } from "../prisma";

let cachedUserId: string | null = null;

/**
 * SpotShare's MVP ships without a login flow — every share is attributed to a
 * single demo account, seeded on first use. Swapping in real auth later only
 * means replacing this lookup with the authenticated request's user id.
 */
export async function getCurrentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const email = process.env.DEMO_USER_EMAIL || "demo@spotshare.app";
  const name = process.env.DEMO_USER_NAME || "Demo User";

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name },
  });

  cachedUserId = user.id;
  return user.id;
}
