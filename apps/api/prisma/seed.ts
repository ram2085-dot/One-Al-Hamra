import { PrismaClient, Role, LaunchType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.favorite.deleteMany();
  await prisma.serviceEntitlement.deleteMany();
  await prisma.serviceAlias.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      email: 'admin@launchpad.local',
      displayName: 'Ava Admin',
      department: 'IT',
      role: Role.ADMIN,
      adUsername: 'aadmin',
    },
  });

  const financeEmployee = await prisma.user.create({
    data: {
      email: 'finance.employee@launchpad.local',
      displayName: 'Finn Ance',
      department: 'Finance',
      role: Role.EMPLOYEE,
      adUsername: 'fance',
    },
  });

  const engEmployee = await prisma.user.create({
    data: {
      email: 'eng.employee@launchpad.local',
      displayName: 'Ellie Ng',
      department: 'Engineering',
      role: Role.EMPLOYEE,
      adUsername: 'eng',
    },
  });

  const helpDesk = await prisma.user.create({
    data: {
      email: 'helpdesk@launchpad.local',
      displayName: 'Hank Desk',
      department: 'IT',
      role: Role.EMPLOYEE,
      adUsername: 'hdesk',
    },
  });

  const expenseSystem = await prisma.service.create({
    data: {
      name: 'Finance Expense System',
      description: 'Submit and track expense reports.',
      category: 'Finance',
      tags: ['expenses', 'reimbursement'],
      vendorName: 'Concur',
      ownerId: admin.id,
      launchType: LaunchType.SSO,
      supportContact: 'finance-support@launchpad.local',
      entitlements: { create: [{ department: 'Finance' }] },
      aliases: { create: [{ alias: 'expenses' }, { alias: 'concur' }] },
    },
  });

  const codeRepo = await prisma.service.create({
    data: {
      name: 'Source Code Repository',
      description: 'Git hosting for engineering teams.',
      category: 'Engineering',
      tags: ['git', 'source-control'],
      vendorName: 'GitLab',
      ownerId: admin.id,
      launchType: LaunchType.SSO,
      supportContact: 'eng-support@launchpad.local',
      entitlements: { create: [{ department: 'Engineering' }] },
      aliases: { create: [{ alias: 'git' }, { alias: 'gitlab' }] },
    },
  });

  const hrPortal = await prisma.service.create({
    data: {
      name: 'HR Self-Service Portal',
      description: 'Payroll, benefits, and time-off requests.',
      category: 'HR',
      tags: ['payroll', 'benefits'],
      vendorName: 'Workday',
      ownerId: admin.id,
      launchType: LaunchType.CREDENTIAL,
      supportContact: 'hr-support@launchpad.local',
      entitlements: { create: [{ role: Role.EMPLOYEE }] },
      aliases: { create: [{ alias: 'workday' }, { alias: 'payroll' }] },
    },
  });

  await prisma.service.create({
    data: {
      name: 'Legacy Timesheet Tool',
      description: 'Deprecated timesheet entry tool.',
      category: 'HR',
      tags: ['timesheet'],
      ownerId: admin.id,
      launchType: LaunchType.SSO,
      status: 'RETIRED',
      supportContact: 'hr-support@launchpad.local',
    },
  });

  await prisma.service.create({
    data: {
      name: 'Unentitled Internal Tool',
      description: 'No entitlements assigned — visible to admins only.',
      category: 'Engineering',
      tags: [],
      ownerId: admin.id,
      launchType: LaunchType.SSO,
      supportContact: 'eng-support@launchpad.local',
    },
  });

  await prisma.favorite.create({ data: { userId: engEmployee.id, serviceId: codeRepo.id } });

  console.log({ admin: admin.email, financeEmployee: financeEmployee.email, engEmployee: engEmployee.email, helpDesk: helpDesk.email, expenseSystem: expenseSystem.id, codeRepo: codeRepo.id, hrPortal: hrPortal.id });
}

main().finally(() => prisma.$disconnect());
