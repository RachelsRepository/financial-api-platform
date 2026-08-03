import { PrismaClient } from '@prisma/client';
import { createHash, scryptSync, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const IDS = {
  northstarInstitution: '11111111-1111-4111-8111-111111111111',
  meridianInstitution: '22222222-2222-4222-8222-222222222222',
  cobaltInstitution: '33333333-3333-4333-8333-333333333333',
  demoClient: '44444444-4444-4444-8444-444444444444',
  demoUser: '55555555-5555-4555-8555-555555555555',
  checkingAccount: '66666666-6666-4666-8666-666666666666',
  savingsAccount: '77777777-7777-4777-8777-777777777777',
} as const;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hashClientSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex');
  // Must match src/infrastructure/security/hashing.ts scrypt parameters.
  const hash = scryptSync(secret, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function main(): Promise<void> {
  const now = new Date();
  const clientSecret = 'demo-client-secret-change-me';

  // Local/demo institutions route to the sandbox provider so docker e2e and
  // developer flows do not call external networks. Adapter code for northstar/
  // meridian/cobalt remains available for integration tests.
  await prisma.institution.createMany({
    data: [
      {
        id: IDS.northstarInstitution,
        code: 'NORTHSTAR',
        name: 'Northstar Bank',
        country: 'US',
        providerCode: 'sandbox',
        isActive: true,
      },
      {
        id: IDS.meridianInstitution,
        code: 'MERIDIAN',
        name: 'Meridian Financial',
        country: 'GB',
        providerCode: 'sandbox',
        isActive: true,
      },
      {
        id: IDS.cobaltInstitution,
        code: 'COBALT',
        name: 'Cobalt Credit Union',
        country: 'CA',
        providerCode: 'sandbox',
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.institution.updateMany({
    data: { providerCode: 'sandbox', isActive: true },
    where: {
      id: {
        in: [IDS.northstarInstitution, IDS.meridianInstitution, IDS.cobaltInstitution],
      },
    },
  });

  await prisma.clientApplication.upsert({
    where: { clientId: 'fap-demo-client' },
    update: {},
    create: {
      id: IDS.demoClient,
      clientId: 'fap-demo-client',
      name: 'Financial API Demo App',
      clientSecretHash: hashClientSecret(clientSecret),
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      allowedScopes: [
        'openid',
        'offline_access',
        'accounts:read',
        'balances:read',
        'transactions:read',
        'beneficiaries:read',
        'payments:read',
        'payments:write',
        'consent:manage',
      ],
      tokenEndpointAuthMethod: 'client_secret_basic',
      requirePkce: true,
      requireMtls: false,
      isConfidential: true,
      isActive: true,
      redirectUris: {
        create: [{ uri: 'https://localhost:3001/oauth/callback' }],
      },
    },
  });

  await prisma.user.upsert({
    where: { externalSubject: 'demo-user-northstar' },
    update: {},
    create: {
      id: IDS.demoUser,
      externalSubject: 'demo-user-northstar',
      emailHash: sha256Hex('demo.user@example.com'),
      displayName: 'Demo User',
      institutionId: IDS.northstarInstitution,
      isActive: true,
    },
  });

  await prisma.account.createMany({
    data: [
      {
        id: IDS.checkingAccount,
        institutionId: IDS.northstarInstitution,
        userId: IDS.demoUser,
        accountType: 'checking',
        currency: 'USD',
        displayName: 'Everyday Checking',
        maskedNumber: '****1234',
        status: 'active',
      },
      {
        id: IDS.savingsAccount,
        institutionId: IDS.northstarInstitution,
        userId: IDS.demoUser,
        accountType: 'savings',
        currency: 'USD',
        displayName: 'High Yield Savings',
        maskedNumber: '****5678',
        status: 'active',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.accountBalance.createMany({
    data: [
      {
        id: '88888888-8888-4888-8888-888888888881',
        accountId: IDS.checkingAccount,
        balanceType: 'available',
        amountMinor: 125_000n,
        currency: 'USD',
        creditDebit: 'credit',
        asOf: now,
      },
      {
        id: '88888888-8888-4888-8888-888888888882',
        accountId: IDS.checkingAccount,
        balanceType: 'current',
        amountMinor: 130_000n,
        currency: 'USD',
        creditDebit: 'credit',
        asOf: now,
      },
      {
        id: '88888888-8888-4888-8888-888888888883',
        accountId: IDS.savingsAccount,
        balanceType: 'available',
        amountMinor: 500_000n,
        currency: 'USD',
        creditDebit: 'credit',
        asOf: now,
      },
      {
        id: '88888888-8888-4888-8888-888888888884',
        accountId: IDS.savingsAccount,
        balanceType: 'current',
        amountMinor: 500_000n,
        currency: 'USD',
        creditDebit: 'credit',
        asOf: now,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.accountTransaction.createMany({
    data: [
      {
        id: '99999999-9999-4999-8999-999999999991',
        accountId: IDS.checkingAccount,
        amountMinor: 45_00n,
        currency: 'USD',
        bookingDate: new Date('2025-12-15T10:00:00.000Z'),
        valueDate: new Date('2025-12-15T10:00:00.000Z'),
        creditDebit: 'debit',
        description: 'Coffee Shop Purchase',
        counterpartyName: 'Daily Brew',
        status: 'booked',
      },
      {
        id: '99999999-9999-4999-8999-999999999992',
        accountId: IDS.checkingAccount,
        amountMinor: 2_500_00n,
        currency: 'USD',
        bookingDate: new Date('2025-12-01T09:00:00.000Z'),
        valueDate: new Date('2025-12-01T09:00:00.000Z'),
        creditDebit: 'credit',
        description: 'Payroll Deposit',
        counterpartyName: 'Acme Corp',
        status: 'booked',
      },
      {
        id: '99999999-9999-4999-8999-999999999993',
        accountId: IDS.savingsAccount,
        amountMinor: 100_00n,
        currency: 'USD',
        bookingDate: new Date('2025-12-10T14:30:00.000Z'),
        valueDate: new Date('2025-12-10T14:30:00.000Z'),
        creditDebit: 'credit',
        description: 'Interest Payment',
        counterpartyName: 'Northstar Bank',
        status: 'booked',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.beneficiary.createMany({
    data: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        accountId: IDS.checkingAccount,
        name: 'Utility Co',
        accountRefMasked: '****9900',
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete.');
  console.log('Demo client_id: fap-demo-client');
  console.log('Demo client_secret:', clientSecret);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
