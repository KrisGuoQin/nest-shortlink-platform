import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const permissions = [
  ['workspace:read', 'Read workspace'],
  ['workspace:update', 'Update workspace'],
  ['workspace:delete', 'Delete workspace'],

  ['member:read', 'Read members'],
  ['member:invite', 'Invite member'],
  ['member:remove', 'Remove member'],
  ['member:role:assign', 'Assign member roles'],

  ['link:create', 'Create link'],
  ['link:read', 'Read link'],
  ['link:update', 'Update link'],
  ['link:delete', 'Delete link'],
  ['audit:read', 'Read audit logs'],
  ['analytics:read', 'Read workspace analytics'],
] as const;

const roleDefinitions = {
  OWNER: permissions.map(([code]) => code),

  ADMIN: [
    'workspace:read',
    'workspace:update',

    'member:read',
    'member:invite',
    'member:remove',
    'member:role:assign',

    'link:create',
    'link:read',
    'link:update',
    'link:delete',

    'audit:read',
    'analytics:read',
  ],

  MEMBER: [
    'workspace:read',
    'member:read',

    'link:create',
    'link:read',
    'link:update',
    'link:delete',
    'analytics:read',
  ],
};

async function main() {
  for (const [code, name] of permissions) {
    await prisma.permission.upsert({
      where: {
        code,
      },

      update: {
        name,
      },

      create: {
        code,
        name,
      },
    });
  }

  for (const [roleCode, permissionCodes] of Object.entries(roleDefinitions)) {
    const role = await prisma.role.upsert({
      where: {
        code: roleCode,
      },

      update: {
        name: roleCode,
      },

      create: {
        code: roleCode,
        name: roleCode,
      },
    });

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
      },
    });

    const rolePermissions = await prisma.permission.findMany({
      where: {
        code: {
          in: permissionCodes,
        },
      },

      select: {
        id: true,
      },
    });

    await prisma.rolePermission.createMany({
      data: rolePermissions.map((permission) => ({
        roleId: role.id,

        permissionId: permission.id,
      })),
    });
  }

  console.log('Workspace RBAC seed completed');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
