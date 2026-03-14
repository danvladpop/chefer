import { PostStatus, PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  // In production, use bcrypt or argon2. For seed, we use a simple placeholder.
  // Replace with: return bcrypt.hash(password, 12);
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...');

  // ── Dan Pop (test user) ────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'dan@chefer.dev' },
    update: {},
    create: {
      email: 'dan@chefer.dev',
      firstName: 'Dan',
      lastName: 'Pop',
      name: 'Dan Pop',
      role: UserRole.USER,
      emailVerified: new Date(),
    },
  });
  console.log('✅ Created user: Dan Pop');

  // Clean up existing data in development
  if (process.env['NODE_ENV'] !== 'production') {
    await prisma.postTag.deleteMany();
    await prisma.post.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.account.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    console.log('🗑️  Cleared existing data');
  }

  // Create admin user
  const adminPassword = await hashPassword('Admin@123!');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@chefer.dev',
      name: 'Admin User',
      role: UserRole.ADMIN,
      passwordHash: adminPassword,
      emailVerified: new Date(),
      profile: {
        create: {
          bio: 'Platform administrator',
          website: 'https://chefer.dev',
          github: 'chefer-admin',
        },
      },
    },
  });
  console.log(`✅ Created admin user: ${admin.email}`);

  // Create regular users
  const userPassword = await hashPassword('User@123!');
  const user1 = await prisma.user.create({
    data: {
      email: 'alice@chefer.dev',
      name: 'Alice Johnson',
      role: UserRole.USER,
      passwordHash: userPassword,
      emailVerified: new Date(),
      profile: {
        create: {
          bio: 'Software engineer and writer',
          website: 'https://alice.dev',
          twitter: 'alicejohnson',
          github: 'alicejohnson',
          location: 'San Francisco, CA',
        },
      },
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'bob@chefer.dev',
      name: 'Bob Smith',
      role: UserRole.MODERATOR,
      passwordHash: userPassword,
      emailVerified: new Date(),
      profile: {
        create: {
          bio: 'Tech enthusiast and content creator',
          github: 'bobsmith',
          location: 'New York, NY',
        },
      },
    },
  });

  console.log(`✅ Created users: ${user1.email}, ${user2.email}`);

  // Create tags
  const tags = await Promise.all([
    prisma.tag.create({ data: { name: 'TypeScript', slug: 'typescript' } }),
    prisma.tag.create({ data: { name: 'React', slug: 'react' } }),
    prisma.tag.create({ data: { name: 'Node.js', slug: 'nodejs' } }),
    prisma.tag.create({ data: { name: 'Next.js', slug: 'nextjs' } }),
    prisma.tag.create({ data: { name: 'PostgreSQL', slug: 'postgresql' } }),
  ]);
  console.log(`✅ Created ${tags.length} tags`);

  // Create posts
  const post1 = await prisma.post.create({
    data: {
      title: 'Getting Started with TypeScript Monorepos',
      slug: 'getting-started-with-typescript-monorepos',
      content: `# Getting Started with TypeScript Monorepos

TypeScript monorepos are a powerful way to organize large codebases. With tools like Turborepo and pnpm workspaces, you can manage multiple packages efficiently.

## Benefits

- **Shared code**: Reuse components, utilities, and types across packages
- **Atomic commits**: Make changes across multiple packages in a single commit
- **Simplified dependency management**: Single lockfile, consistent versions

## Setting Up

First, initialize your workspace with pnpm and Turborepo...`,
      excerpt: 'Learn how to set up a production-ready TypeScript monorepo with Turborepo.',
      published: true,
      status: PostStatus.PUBLISHED,
      publishedAt: new Date(),
      authorId: user1.id,
      tags: {
        create: [
          { tag: { connect: { slug: 'typescript' } } },
          { tag: { connect: { slug: 'nodejs' } } },
        ],
      },
    },
  });

  const post2 = await prisma.post.create({
    data: {
      title: 'Building Modern Web Apps with Next.js 15',
      slug: 'building-modern-web-apps-nextjs-15',
      content: `# Building Modern Web Apps with Next.js 15

Next.js 15 introduces significant improvements to the App Router, making it easier than ever to build performant web applications.

## What's New

- Improved caching behavior
- React 19 support
- Enhanced Server Actions
- Better TypeScript support

## Getting Started

Create a new Next.js application...`,
      excerpt: 'Explore the latest features in Next.js 15 and how to leverage them.',
      published: true,
      status: PostStatus.PUBLISHED,
      publishedAt: new Date(),
      authorId: user2.id,
      tags: {
        create: [
          { tag: { connect: { slug: 'nextjs' } } },
          { tag: { connect: { slug: 'react' } } },
          { tag: { connect: { slug: 'typescript' } } },
        ],
      },
    },
  });

  await prisma.post.create({
    data: {
      title: 'PostgreSQL Performance Tips',
      slug: 'postgresql-performance-tips',
      content: 'Draft content for PostgreSQL performance tips...',
      published: false,
      status: PostStatus.DRAFT,
      authorId: admin.id,
      tags: {
        create: [{ tag: { connect: { slug: 'postgresql' } } }],
      },
    },
  });

  console.log(`✅ Created posts: ${post1.title}, ${post2.title}`);

  console.log('');
  console.log('✨ Database seeded successfully!');
  console.log('');
  console.log('📧 Login credentials:');
  console.log('   Admin:     admin@chefer.dev / Admin@123!');
  console.log('   User:      alice@chefer.dev / User@123!');
  console.log('   Moderator: bob@chefer.dev   / User@123!');
}

main()
  .catch((error: unknown) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
