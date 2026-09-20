import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import {
  PrismaClient,
} from '../src/generated/prisma/client.js';

const connectionString =
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not defined',
  );
}

const adapter =
  new PrismaPg({
    connectionString,
  });

const prisma =
  new PrismaClient({
    adapter,
  });

const permissionDefinitions = [
  {
    code: 'user:read',
    name: 'Read users',
  },

  {
    code: 'user:update',
    name: 'Update users',
  },

  {
    code: 'user:delete',
    name: 'Delete users',
  },

  {
    code: 'role:read',
    name: 'Read roles',
  },

  {
    code: 'role:assign',
    name: 'Assign roles',
  },
];

async function main() {
  const permissions = [];

  for (
    const definition
    of permissionDefinitions
  ) {
    const permission =
      await prisma.permission.upsert({
        where: {
          code: definition.code,
        },

        update: {
          name: definition.name,
        },

        create: definition,
      });

    permissions.push(permission);
  }

  const admin =
    await prisma.role.upsert({
      where: {
        code: 'ADMIN',
      },

      update: {
        name: 'Administrator',
      },

      create: {
        code: 'ADMIN',
        name: 'Administrator',
      },
    });

  const member =
    await prisma.role.upsert({
      where: {
        code: 'MEMBER',
      },

      update: {
        name: 'Member',
      },

      create: {
        code: 'MEMBER',
        name: 'Member',
      },
    });

  // 开发环境直接重建 ADMIN 权限关系。
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: admin.id,
    },
  });

  await prisma.rolePermission.createMany({
    data: permissions.map(
      (permission) => ({
        roleId: admin.id,
        permissionId:
          permission.id,
      }),
    ),
  });

  // 给已经存在的用户补 MEMBER。
  const users =
    await prisma.user.findMany({
      select: {
        id: true,
      },
    });

  if (users.length > 0) {
    await prisma.userRole.createMany({
      data: users.map(
        (user) => ({
          userId: user.id,
          roleId: member.id,
        }),
      ),

      skipDuplicates: true,
    });
  }

  // 指定一个开发环境管理员。
  const adminEmail =
    process.env
      .BOOTSTRAP_ADMIN_EMAIL
      ?.trim()
      .toLowerCase();

  if (adminEmail) {
    const adminUser =
      await prisma.user.findUnique({
        where: {
          email: adminEmail,
        },
      });

    if (!adminUser) {
      throw new Error(
        `BOOTSTRAP_ADMIN_EMAIL user not found: ${adminEmail}`,
      );
    }

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: adminUser.id,
          roleId: admin.id,
        },
      },

      create: {
        userId: adminUser.id,
        roleId: admin.id,
      },

      update: {},
    });
  }

  console.log(
    'RBAC seed completed',
  );
}

main()
  .catch((error) => {
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });