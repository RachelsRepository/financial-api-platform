/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-frameworks',
      severity: 'error',
      comment: 'Domain must not import NestJS, Prisma, Kafka, Redis, Fastify, or providers.',
      from: { path: '^src/domain' },
      to: {
        path: '^src/(infrastructure|interfaces|observability|config|app\\.module|main)',
      },
    },
    {
      name: 'domain-no-external-frameworks',
      severity: 'error',
      from: { path: '^src/domain' },
      to: {
        path: 'node_modules/(@nestjs|@prisma|kafkajs|ioredis|fastify|@fastify)',
        pathNot: 'node_modules/(zod)',
      },
    },
    {
      name: 'application-no-infrastructure',
      severity: 'error',
      comment: 'Application must depend on ports, not infrastructure implementations.',
      from: { path: '^src/application' },
      to: {
        path: '^src/(infrastructure|interfaces)',
      },
    },
    {
      name: 'application-no-nestjs-prisma',
      severity: 'error',
      from: { path: '^src/application' },
      to: {
        path: 'node_modules/(@nestjs|@prisma|kafkajs|ioredis|fastify)',
      },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
