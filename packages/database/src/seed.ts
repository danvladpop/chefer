import { PostStatus, PrismaClient, UserRole, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
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

  // Create admin user (idempotent: an existing account is left exactly as it is)
  const adminPassword = await hashPassword('Admin@123!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@chefer.dev' },
    update: {},
    create: {
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
  console.log(`✅ Admin user: ${admin.email}`);

  // Create regular users
  const userPassword = await hashPassword('User@123!');
  const user1 = await prisma.user.upsert({
    where: { email: 'alice@chefer.dev' },
    update: {},
    create: {
      email: 'alice@chefer.dev',
      name: 'Alice Johnson',
      // Alice is the demo admin: full access, may edit global ingredients
      role: UserRole.ADMIN,
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

  const user2 = await prisma.user.upsert({
    where: { email: 'bob@chefer.dev' },
    update: {},
    create: {
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

  console.log(`✅ Users: ${user1.email}, ${user2.email}`);

  // Create tags
  const tagDefs = [
    { name: 'TypeScript', slug: 'typescript' },
    { name: 'React', slug: 'react' },
    { name: 'Node.js', slug: 'nodejs' },
    { name: 'Next.js', slug: 'nextjs' },
    { name: 'PostgreSQL', slug: 'postgresql' },
  ];
  const tags = await Promise.all(
    tagDefs.map((tag) => prisma.tag.upsert({ where: { slug: tag.slug }, update: {}, create: tag })),
  );
  console.log(`✅ Tags: ${tags.length}`);

  // Create posts
  const post1 = await prisma.post.upsert({
    where: { slug: 'getting-started-with-typescript-monorepos' },
    update: {},
    create: {
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

  const post2 = await prisma.post.upsert({
    where: { slug: 'building-modern-web-apps-nextjs-15' },
    update: {},
    create: {
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

  await prisma.post.upsert({
    where: { slug: 'postgresql-performance-tips' },
    update: {},
    create: {
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

  console.log(`✅ Posts: ${post1.title}, ${post2.title}`);

  await seedFollowing(user1.id, userPassword);

  console.log('');
  console.log('✨ Database seeded successfully!');
  console.log('');
  console.log('📧 Login credentials:');
  console.log('   Admin:     admin@chefer.dev / Admin@123!');
  console.log('   User:      alice@chefer.dev / User@123!');
  console.log('   Moderator: bob@chefer.dev   / User@123!');
  console.log('   Following: carol@chefer.dev (public), dave@chefer.dev (private),');
  console.log('              kitchen@chefer.dev (Chefer Kitchen, public, featured) / User@123!');
}

// ─── Following (docs/friends/implementation-plan.md §9 "Seed data", F1.5) ─────
// Three social accounts for dogfooding and the Maestro/contract suites:
//   carol   PUBLIC, fixed id, 6 recipes (2 imported), an active routine, 4
//           workouts in the last 7 days + 3 older, a current-week plan
//   dave    PRIVATE, fixed id, a PENDING request to alice (+ its Activity item)
//   kitchen "Chefer Kitchen", PUBLIC, featured, a few recipes
// alice is deliberately NOT activated, so the intro flow can be tested.
//
// Idempotent: every row is an upsert on a fixed cuid-shaped id (or on a natural
// unique key), so a second run changes no row count. Content that is relative
// to "today" (workout dates, the plan's week) is re-anchored on each run
// from the UTC calendar day, so re-seeding on a later day keeps the demo data
// current instead of letting it age out of the 7-day window.

const SEED_DAY_MS = 24 * 60 * 60 * 1000;
/** Fixed, so re-running never rewrites `emailVerified`. */
const SEED_VERIFIED_AT = new Date('2026-01-01T00:00:00.000Z');

const CAROL_ID = 'cseedcarol000000000000001';
const DAVE_ID = 'cseeddave0000000000000001';
const KITCHEN_ID = 'cseedkitchen00000000000001';

/** A cuid-shaped fixed id: `c` + 24 lowercase alphanumerics. `kind` ≤ 6 chars. */
function fid(kind: string, n: number): string {
  const prefix = `cseed${kind}`;
  return `${prefix}${String(n).padStart(25 - prefix.length, '0')}`;
}

/** `YYYY-MM-DD` of the UTC day `daysAgo` days before `now`. */
function utcDay(now: Date, daysAgo: number): string {
  return new Date(now.getTime() - daysAgo * SEED_DAY_MS).toISOString().slice(0, 10);
}

/** The UTC Monday (as a UTC-midnight Date) of the week containing `now` — what `MealPlan.weekStartDate` holds. */
function mondayUtc(now: Date): Date {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(`${utcDay(now, daysSinceMonday)}T00:00:00.000Z`);
}

/** Same folding as `normalizeSearchName` (@chefer/utils) for the plain-ASCII seed names. */
function searchNameOf(first: string, last: string): string {
  return `${first} ${last}`.toLowerCase();
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface SeedRecipe {
  name: string;
  description: string;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: string[];
  nutrition: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  /** Set on imported recipes (Cheferize). */
  sourceUrl?: string;
  mealType: MealType;
}

const CAROL_RECIPES: SeedRecipe[] = [
  {
    name: 'Overnight Oats with Berries',
    description: 'Creamy oats soaked overnight, topped with fresh berries.',
    ingredients: [
      { name: 'Rolled oats', quantity: 60, unit: 'g' },
      { name: 'Greek yogurt', quantity: 120, unit: 'g' },
      { name: 'Milk', quantity: 100, unit: 'ml' },
      { name: 'Mixed berries', quantity: 80, unit: 'g' },
    ],
    instructions: ['Stir oats, yogurt and milk in a jar.', 'Chill overnight.', 'Top with berries.'],
    nutrition: { calories: 380, protein: 22, carbs: 54, fat: 8, fiber: 8 },
    cuisineType: 'American',
    dietaryTags: ['vegetarian', 'high-fiber'],
    prepTimeMins: 5,
    cookTimeMins: 0,
    servings: 1,
    mealType: 'breakfast',
  },
  {
    name: 'Chicken Quinoa Bowl',
    description: 'Grilled chicken over quinoa with roasted vegetables.',
    ingredients: [
      { name: 'Chicken breast', quantity: 180, unit: 'g' },
      { name: 'Quinoa', quantity: 70, unit: 'g' },
      { name: 'Zucchini', quantity: 1, unit: 'medium' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
    ],
    instructions: [
      'Cook the quinoa.',
      'Grill the chicken and the zucchini.',
      'Assemble the bowl and drizzle with olive oil.',
    ],
    nutrition: { calories: 560, protein: 48, carbs: 52, fat: 16, fiber: 7 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['high-protein', 'gluten-free', 'dairy-free'],
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 1,
    mealType: 'lunch',
  },
  {
    name: 'Shakshuka',
    description: 'Eggs poached in a spiced tomato and pepper sauce.',
    ingredients: [
      { name: 'Eggs', quantity: 3, unit: 'whole' },
      { name: 'Canned tomatoes', quantity: 400, unit: 'g' },
      { name: 'Red pepper', quantity: 1, unit: 'medium' },
      { name: 'Cumin', quantity: 1, unit: 'tsp' },
    ],
    instructions: [
      'Simmer the peppers and tomatoes with the spices.',
      'Make wells and crack in the eggs.',
      'Cover until the whites set.',
    ],
    nutrition: { calories: 420, protein: 26, carbs: 24, fat: 24, fiber: 6 },
    cuisineType: 'Middle Eastern',
    dietaryTags: ['vegetarian', 'gluten-free', 'high-protein'],
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 2,
    sourceUrl: 'https://www.seed-recipes.example.com/shakshuka',
    mealType: 'dinner',
  },
  {
    name: 'Lentil Tomato Soup',
    description: 'A thick red lentil soup that keeps for days.',
    ingredients: [
      { name: 'Red lentils', quantity: 150, unit: 'g' },
      { name: 'Canned tomatoes', quantity: 400, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: 'medium' },
      { name: 'Vegetable stock', quantity: 750, unit: 'ml' },
    ],
    instructions: [
      'Soften the onion.',
      'Add lentils, tomatoes and stock.',
      'Simmer 20 minutes and blend.',
    ],
    nutrition: { calories: 340, protein: 20, carbs: 56, fat: 4, fiber: 14 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['vegan', 'dairy-free', 'high-fiber'],
    prepTimeMins: 10,
    cookTimeMins: 25,
    servings: 3,
    sourceUrl: 'https://www.seed-recipes.example.com/lentil-tomato-soup',
    mealType: 'dinner',
  },
  {
    name: 'Cottage Cheese Toast',
    description: 'Wholegrain toast with cottage cheese, cucumber and seeds.',
    ingredients: [
      { name: 'Wholegrain bread', quantity: 2, unit: 'slice' },
      { name: 'Cottage cheese', quantity: 150, unit: 'g' },
      { name: 'Cucumber', quantity: 0.5, unit: 'medium' },
      { name: 'Pumpkin seeds', quantity: 10, unit: 'g' },
    ],
    instructions: [
      'Toast the bread.',
      'Spread the cottage cheese.',
      'Top with cucumber and seeds.',
    ],
    nutrition: { calories: 290, protein: 24, carbs: 28, fat: 9, fiber: 5 },
    cuisineType: 'American',
    dietaryTags: ['vegetarian', 'high-protein'],
    prepTimeMins: 5,
    cookTimeMins: 2,
    servings: 1,
    mealType: 'snack',
  },
  {
    name: 'Baked Salmon with Greens',
    description: 'Lemon salmon baked on a bed of green beans.',
    ingredients: [
      { name: 'Salmon fillet', quantity: 180, unit: 'g' },
      { name: 'Green beans', quantity: 150, unit: 'g' },
      { name: 'Lemon', quantity: 0.5, unit: 'medium' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
    ],
    instructions: ['Heat the oven to 200C.', 'Season the salmon and beans.', 'Bake 15 minutes.'],
    nutrition: { calories: 520, protein: 40, carbs: 10, fat: 34, fiber: 4 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['high-protein', 'gluten-free', 'dairy-free', 'keto'],
    prepTimeMins: 10,
    cookTimeMins: 15,
    servings: 1,
    mealType: 'dinner',
  },
];

const KITCHEN_RECIPES: SeedRecipe[] = [
  {
    name: 'Classic Margherita Pizza',
    description: 'Thin crust, San Marzano tomatoes, mozzarella and basil.',
    ingredients: [
      { name: 'Pizza dough', quantity: 250, unit: 'g' },
      { name: 'Tomato passata', quantity: 100, unit: 'g' },
      { name: 'Mozzarella', quantity: 125, unit: 'g' },
      { name: 'Basil', quantity: 6, unit: 'leaf' },
    ],
    instructions: [
      'Stretch the dough.',
      'Add passata and mozzarella.',
      'Bake hot, then add basil.',
    ],
    nutrition: { calories: 780, protein: 34, carbs: 98, fat: 26, fiber: 6 },
    cuisineType: 'Italian',
    dietaryTags: ['vegetarian'],
    prepTimeMins: 20,
    cookTimeMins: 12,
    servings: 2,
    mealType: 'dinner',
  },
  {
    name: 'Greek Salad',
    description: 'Tomato, cucumber, olives and feta with oregano.',
    ingredients: [
      { name: 'Tomatoes', quantity: 3, unit: 'medium' },
      { name: 'Cucumber', quantity: 1, unit: 'medium' },
      { name: 'Feta', quantity: 100, unit: 'g' },
      { name: 'Olives', quantity: 40, unit: 'g' },
    ],
    instructions: ['Chop the vegetables.', 'Add feta and olives.', 'Dress with oil and oregano.'],
    nutrition: { calories: 310, protein: 12, carbs: 14, fat: 24, fiber: 4 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['vegetarian', 'gluten-free'],
    prepTimeMins: 10,
    cookTimeMins: 0,
    servings: 2,
    mealType: 'lunch',
  },
  {
    name: 'Banana Pancakes',
    description: 'Fluffy two-ingredient-and-a-bit pancakes.',
    ingredients: [
      { name: 'Banana', quantity: 2, unit: 'medium' },
      { name: 'Eggs', quantity: 2, unit: 'whole' },
      { name: 'Oat flour', quantity: 40, unit: 'g' },
    ],
    instructions: [
      'Mash the bananas.',
      'Whisk in eggs and flour.',
      'Cook small pancakes until golden.',
    ],
    nutrition: { calories: 410, protein: 16, carbs: 62, fat: 11, fiber: 7 },
    cuisineType: 'American',
    dietaryTags: ['vegetarian'],
    prepTimeMins: 5,
    cookTimeMins: 10,
    servings: 1,
    mealType: 'breakfast',
  },
  {
    name: 'Chickpea Curry',
    description: 'Chickpeas simmered in a mild coconut curry sauce.',
    ingredients: [
      { name: 'Chickpeas', quantity: 400, unit: 'g' },
      { name: 'Coconut milk', quantity: 200, unit: 'ml' },
      { name: 'Curry paste', quantity: 2, unit: 'tbsp' },
      { name: 'Spinach', quantity: 80, unit: 'g' },
    ],
    instructions: [
      'Fry the paste.',
      'Add chickpeas and coconut milk.',
      'Simmer, then wilt in the spinach.',
    ],
    nutrition: { calories: 480, protein: 18, carbs: 52, fat: 22, fiber: 14 },
    cuisineType: 'Indian',
    dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber'],
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 2,
    mealType: 'dinner',
  },
];

interface CuratedExercise {
  id: string;
  name: string;
  category: 'COMPOUND' | 'ISOLATION';
  movementPattern: string;
  equipment: 'BARBELL' | 'DUMBBELL' | 'CABLE' | 'MACHINE';
  primaryMuscles: string[];
  repMin: number;
  repMax: number;
  restSec: number;
  incrementKg: number;
  isLowerBody: boolean;
}

/**
 * The curated rows the demo routine uses (same ids as @chefer/types
 * EXERCISE_CATALOG; this package cannot import it under its rootDir). The API
 * upserts the full catalog at boot and overwrites these with the complete
 * content, so they only matter on a DB that was seeded before the API ever ran.
 */
const CURATED_EXERCISES: CuratedExercise[] = [
  {
    id: 'barbell-bench-press',
    name: 'Barbell Bench Press',
    category: 'COMPOUND',
    movementPattern: 'horizontal-push',
    equipment: 'BARBELL',
    primaryMuscles: ['chest'],
    repMin: 6,
    repMax: 10,
    restSec: 180,
    incrementKg: 2.5,
    isLowerBody: false,
  },
  {
    id: 'overhead-press',
    name: 'Overhead Press',
    category: 'COMPOUND',
    movementPattern: 'vertical-push',
    equipment: 'BARBELL',
    primaryMuscles: ['front-delts'],
    repMin: 6,
    repMax: 10,
    restSec: 150,
    incrementKg: 2.5,
    isLowerBody: false,
  },
  {
    id: 'incline-dumbbell-press',
    name: 'Incline Dumbbell Press',
    category: 'COMPOUND',
    movementPattern: 'incline-push',
    equipment: 'DUMBBELL',
    primaryMuscles: ['chest'],
    repMin: 8,
    repMax: 12,
    restSec: 120,
    incrementKg: 2,
    isLowerBody: false,
  },
  {
    id: 'triceps-pushdown',
    name: 'Triceps Pushdown',
    category: 'ISOLATION',
    movementPattern: 'elbow-extension',
    equipment: 'CABLE',
    primaryMuscles: ['triceps'],
    repMin: 10,
    repMax: 15,
    restSec: 90,
    incrementKg: 2.5,
    isLowerBody: false,
  },
  {
    id: 'barbell-row',
    name: 'Barbell Row',
    category: 'COMPOUND',
    movementPattern: 'horizontal-pull',
    equipment: 'BARBELL',
    primaryMuscles: ['upper-back', 'lats'],
    repMin: 6,
    repMax: 10,
    restSec: 150,
    incrementKg: 2.5,
    isLowerBody: false,
  },
  {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    category: 'COMPOUND',
    movementPattern: 'vertical-pull',
    equipment: 'CABLE',
    primaryMuscles: ['lats'],
    repMin: 8,
    repMax: 12,
    restSec: 120,
    incrementKg: 5,
    isLowerBody: false,
  },
  {
    id: 'seated-cable-row',
    name: 'Seated Cable Row',
    category: 'COMPOUND',
    movementPattern: 'horizontal-pull',
    equipment: 'CABLE',
    primaryMuscles: ['upper-back', 'lats'],
    repMin: 8,
    repMax: 12,
    restSec: 120,
    incrementKg: 5,
    isLowerBody: false,
  },
  {
    id: 'dumbbell-curl',
    name: 'Dumbbell Curl',
    category: 'ISOLATION',
    movementPattern: 'elbow-flexion',
    equipment: 'DUMBBELL',
    primaryMuscles: ['biceps'],
    repMin: 10,
    repMax: 15,
    restSec: 90,
    incrementKg: 2,
    isLowerBody: false,
  },
  {
    id: 'back-squat',
    name: 'Back Squat',
    category: 'COMPOUND',
    movementPattern: 'squat',
    equipment: 'BARBELL',
    primaryMuscles: ['quads'],
    repMin: 5,
    repMax: 8,
    restSec: 180,
    incrementKg: 2.5,
    isLowerBody: true,
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    category: 'COMPOUND',
    movementPattern: 'hinge',
    equipment: 'BARBELL',
    primaryMuscles: ['hamstrings'],
    repMin: 6,
    repMax: 10,
    restSec: 150,
    incrementKg: 2.5,
    isLowerBody: true,
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    category: 'COMPOUND',
    movementPattern: 'squat',
    equipment: 'MACHINE',
    primaryMuscles: ['quads'],
    repMin: 10,
    repMax: 15,
    restSec: 150,
    incrementKg: 5,
    isLowerBody: true,
  },
  {
    id: 'standing-calf-raise',
    name: 'Standing Calf Raise',
    category: 'ISOLATION',
    movementPattern: 'calf-raise',
    equipment: 'MACHINE',
    primaryMuscles: ['calves'],
    repMin: 10,
    repMax: 15,
    restSec: 90,
    incrementKg: 5,
    isLowerBody: true,
  },
];

async function ensureCuratedExercises(ids: string[]): Promise<void> {
  const have = new Set(
    (await prisma.exercise.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(
      (e) => e.id,
    ),
  );
  for (const id of ids) {
    if (have.has(id)) continue;
    const ex = CURATED_EXERCISES.find((e) => e.id === id);
    if (!ex) throw new Error(`Seed exercise "${id}" has no definition in CURATED_EXERCISES`);
    await prisma.exercise.create({
      data: {
        ...ex,
        ownerId: null,
        aliases: [],
        loadType: 'WEIGHTED',
        secondaryMuscles: [],
        perHand: false,
        isTimed: false,
        cues: [],
        mistakes: [],
        imageKeys: [],
      },
    });
  }
}

async function upsertSocialUser(data: {
  /** 1-based; names the fixed consent-event id. */
  n: number;
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  featured?: boolean;
}): Promise<string> {
  const name = `${data.firstName} ${data.lastName}`;
  // Upsert on the unique email; the fixed id applies on creation. An existing
  // row keeps its own id and password, so children below use the returned id.
  const user = await prisma.user.upsert({
    where: { email: data.email },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      name,
      emailVerified: SEED_VERIFIED_AT,
    },
    create: {
      id: data.id,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      name,
      role: UserRole.USER,
      passwordHash: data.passwordHash,
      emailVerified: SEED_VERIFIED_AT,
    },
  });
  const profile = {
    visibility: data.visibility,
    searchName: searchNameOf(data.firstName, data.lastName),
    featured: data.featured ?? false,
  };
  await prisma.socialProfile.upsert({
    where: { userId: user.id },
    update: profile,
    create: { userId: user.id, ...profile, activatedAt: SEED_VERIFIED_AT },
  });
  // The turn-on consent (PRD FR-22.1 exports it). One fixed row per account.
  await prisma.consentEvent.upsert({
    where: { id: fid('cns', data.n) },
    update: {},
    create: {
      id: fid('cns', data.n),
      userId: user.id,
      kind: 'SOCIAL_SHARING',
      granted: true,
      source: 'seed',
      createdAt: SEED_VERIFIED_AT,
    },
  });
  return user.id;
}

async function seedRecipes(
  ownerId: string,
  ownerIdx: number,
  recipes: SeedRecipe[],
  now: Date,
): Promise<string[]> {
  const ids: string[] = [];
  for (const [i, r] of recipes.entries()) {
    const id = fid('rcp', ownerIdx * 100 + i + 1);
    ids.push(id);
    await prisma.recipe.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: r.name,
        description: r.description,
        ingredients: r.ingredients,
        instructions: r.instructions,
        nutritionInfo: r.nutrition,
        cuisineType: r.cuisineType,
        dietaryTags: r.dietaryTags,
        prepTimeMins: r.prepTimeMins,
        cookTimeMins: r.cookTimeMins,
        servings: r.servings,
        imageStatus: 'DONE',
        source: 'MANUAL',
        sourceUrl: r.sourceUrl ?? null,
        creatorId: ownerId,
        // Newest first: the list order is stable and distinct.
        createdAt: new Date(`${utcDay(now, i + 1)}T09:00:00.000Z`),
      },
    });
  }
  return ids;
}

async function seedCarolPlan(carolId: string, recipeIds: string[], now: Date): Promise<void> {
  const planId = fid('plan', 1);
  const weekStartDate = mondayUtc(now);
  await prisma.mealPlan.upsert({
    where: { id: planId },
    // Re-anchored to the current week on every run.
    update: { weekStartDate, status: 'ACTIVE' },
    create: { id: planId, userId: carolId, weekStartDate, status: 'ACTIVE', origin: 'USER' },
  });
  const byType = (t: MealType): string[] =>
    CAROL_RECIPES.flatMap((r, i) => {
      const id = recipeIds[i];
      return r.mealType === t && id ? [id] : [];
    });
  const breakfasts = byType('breakfast');
  const lunches = byType('lunch');
  const dinners = byType('dinner');
  const snacks = byType('snack');
  for (let day = 0; day < 7; day++) {
    const meals = [
      { type: 'breakfast', recipeId: breakfasts[day % breakfasts.length] },
      { type: 'lunch', recipeId: lunches[day % lunches.length] },
      { type: 'dinner', recipeId: dinners[day % dinners.length] },
      { type: 'snack', recipeId: snacks[day % snacks.length] },
    ] as Prisma.InputJsonValue;
    await prisma.mealPlanDay.upsert({
      where: { id: fid('pday', day + 1) },
      update: { meals },
      create: { id: fid('pday', day + 1), mealPlanId: planId, dayOfWeek: day, meals },
    });
  }
}

interface SeedRoutineExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  weightKg: number;
}

const CAROL_ROUTINE_DAYS: { name: string; weekday: number; exercises: SeedRoutineExercise[] }[] = [
  {
    name: 'Push',
    weekday: 0,
    exercises: [
      {
        exerciseId: 'barbell-bench-press',
        sets: 3,
        repMin: 6,
        repMax: 10,
        restSec: 150,
        weightKg: 60,
      },
      { exerciseId: 'overhead-press', sets: 3, repMin: 6, repMax: 10, restSec: 120, weightKg: 40 },
      {
        exerciseId: 'incline-dumbbell-press',
        sets: 3,
        repMin: 8,
        repMax: 12,
        restSec: 90,
        weightKg: 22,
      },
      {
        exerciseId: 'triceps-pushdown',
        sets: 3,
        repMin: 10,
        repMax: 15,
        restSec: 60,
        weightKg: 30,
      },
    ],
  },
  {
    name: 'Pull',
    weekday: 2,
    exercises: [
      { exerciseId: 'barbell-row', sets: 3, repMin: 6, repMax: 10, restSec: 150, weightKg: 55 },
      { exerciseId: 'lat-pulldown', sets: 3, repMin: 8, repMax: 12, restSec: 90, weightKg: 50 },
      { exerciseId: 'seated-cable-row', sets: 3, repMin: 8, repMax: 12, restSec: 90, weightKg: 45 },
      { exerciseId: 'dumbbell-curl', sets: 3, repMin: 10, repMax: 15, restSec: 60, weightKg: 12 },
    ],
  },
  {
    name: 'Legs',
    weekday: 4,
    exercises: [
      { exerciseId: 'back-squat', sets: 3, repMin: 5, repMax: 8, restSec: 180, weightKg: 80 },
      {
        exerciseId: 'romanian-deadlift',
        sets: 3,
        repMin: 8,
        repMax: 10,
        restSec: 120,
        weightKg: 70,
      },
      { exerciseId: 'leg-press', sets: 3, repMin: 10, repMax: 15, restSec: 90, weightKg: 140 },
      {
        exerciseId: 'standing-calf-raise',
        sets: 3,
        repMin: 12,
        repMax: 20,
        restSec: 60,
        weightKg: 50,
      },
    ],
  },
];

async function seedCarolGym(carolId: string, now: Date): Promise<void> {
  await ensureCuratedExercises(
    CAROL_ROUTINE_DAYS.flatMap((d) => d.exercises.map((e) => e.exerciseId)),
  );

  const routineId = fid('rtn', 1);
  await prisma.routine.upsert({
    where: { id: routineId },
    update: { isActive: true, archivedAt: null },
    create: { id: routineId, userId: carolId, name: 'Push Pull Legs', isActive: true },
  });
  const dayIds: string[] = [];
  for (const [d, day] of CAROL_ROUTINE_DAYS.entries()) {
    const dayId = fid('rday', d + 1);
    dayIds.push(dayId);
    await prisma.routineDay.upsert({
      where: { id: dayId },
      update: {},
      create: { id: dayId, routineId, position: d, name: day.name, plannedWeekday: day.weekday },
    });
    for (const [e, ex] of day.exercises.entries()) {
      const exId = fid('rex', (d + 1) * 10 + e + 1);
      await prisma.routineExercise.upsert({
        where: { id: exId },
        update: {},
        create: {
          id: exId,
          dayId,
          exerciseId: ex.exerciseId,
          position: e,
          sets: ex.sets,
          repMin: ex.repMin,
          repMax: ex.repMax,
          restSec: ex.restSec,
        },
      });
    }
  }
  await prisma.routine.update({ where: { id: routineId }, data: { nextDayId: dayIds[0] ?? null } });

  // 4 completed in the owner's last 7 days (today − 6 … today) + 3 older.
  // Offsets avoid the window's edges, so a seed that runs just before UTC
  // midnight still shows 4 once the day rolls over.
  const sessionOffsets = [1, 2, 4, 5, 8, 10, 14];
  for (const [s, daysAgo] of sessionOffsets.entries()) {
    const dayIdx = s % CAROL_ROUTINE_DAYS.length;
    const day = CAROL_ROUTINE_DAYS[dayIdx];
    const dayId = dayIds[dayIdx];
    if (!day || !dayId) continue;
    const localDate = utcDay(now, daysAgo);
    const startedAt = new Date(`${localDate}T17:30:00.000Z`);
    const finishedAt = new Date(startedAt.getTime() + 55 * 60_000);
    const sessionId = fid('ws', s + 1);
    await prisma.workoutSession.upsert({
      where: { id: sessionId },
      // Re-anchored on every run; clientUpdatedAt moves with it.
      update: {
        localDate,
        startedAt,
        finishedAt,
        clientUpdatedAt: finishedAt,
        status: 'COMPLETED',
      },
      create: {
        id: sessionId,
        userId: carolId,
        routineId,
        routineDayId: dayId,
        name: day.name,
        status: 'COMPLETED',
        startedAt,
        finishedAt,
        localDate,
        clientUpdatedAt: finishedAt,
        engineVersion: 1,
      },
    });
    for (const [e, ex] of day.exercises.entries()) {
      const seId = fid('wse', (s + 1) * 10 + e + 1);
      await prisma.sessionExercise.upsert({
        where: { id: seId },
        update: {},
        create: {
          id: seId,
          sessionId,
          exerciseId: ex.exerciseId,
          routineExerciseId: fid('rex', (dayIdx + 1) * 10 + e + 1),
          position: e,
          repMin: ex.repMin,
          repMax: ex.repMax,
          targetRir: 2,
          restSec: ex.restSec,
          prescription: {
            kind: 'start',
            reps: Array.from({ length: ex.sets }, () => ex.repMin),
            sets: ex.sets,
            inputs: {},
            deltaKg: 0,
            weightKg: ex.weightKg,
            reasonCode: 'START',
            engineVersion: 1,
          },
        },
      });
      for (let k = 0; k < ex.sets; k++) {
        const setId = fid('wset', ((s + 1) * 10 + e + 1) * 10 + k + 1);
        await prisma.sessionSet.upsert({
          where: { id: setId },
          update: { completedAt: finishedAt },
          create: {
            id: setId,
            sessionExerciseId: seId,
            position: k,
            // Older sessions lifted a little less: a visible progression.
            weightKg: Math.max(0, ex.weightKg - Math.floor(s / 2) * 2.5),
            reps: ex.repMin + (k === 0 ? 1 : 0),
            completedAt: finishedAt,
          },
        });
      }
    }
  }
}

/** `passwordHash` is the bcrypt hash of `User@123!` (the one alice and bob get). */
async function seedFollowing(aliceId: string, passwordHash: string): Promise<void> {
  const now = new Date();

  const carolId = await upsertSocialUser({
    n: 1,
    id: CAROL_ID,
    email: 'carol@chefer.dev',
    firstName: 'Carol',
    lastName: 'Reyes',
    passwordHash,
    visibility: 'PUBLIC',
  });
  const daveId = await upsertSocialUser({
    n: 2,
    id: DAVE_ID,
    email: 'dave@chefer.dev',
    firstName: 'Dave',
    lastName: 'Okafor',
    passwordHash,
    visibility: 'PRIVATE',
  });
  const kitchenId = await upsertSocialUser({
    n: 3,
    id: KITCHEN_ID,
    email: 'kitchen@chefer.dev',
    firstName: 'Chefer',
    lastName: 'Kitchen',
    passwordHash,
    visibility: 'PUBLIC',
    featured: true,
  });

  const carolRecipeIds = await seedRecipes(carolId, 1, CAROL_RECIPES, now);
  await seedRecipes(kitchenId, 3, KITCHEN_RECIPES, now);
  await seedCarolPlan(carolId, carolRecipeIds, now);
  await seedCarolGym(carolId, now);

  // Dave (private) has asked to follow alice; alice has not answered yet.
  // Re-anchored to yesterday on every run, so the 90-day expiry never eats it.
  const requestedAt = new Date(`${utcDay(now, 1)}T10:00:00.000Z`);
  await prisma.follow.upsert({
    where: { followerId_followeeId: { followerId: daveId, followeeId: aliceId } },
    update: { status: 'PENDING', createdAt: requestedAt },
    create: {
      id: fid('fol', 1),
      followerId: daveId,
      followeeId: aliceId,
      status: 'PENDING',
      createdAt: requestedAt,
    },
  });
  await prisma.notification.upsert({
    where: {
      userId_kind_actorId: { userId: aliceId, kind: 'FOLLOW_REQUEST', actorId: daveId },
    },
    update: { createdAt: requestedAt },
    create: {
      id: fid('ntf', 1),
      userId: aliceId,
      kind: 'FOLLOW_REQUEST',
      actorId: daveId,
      createdAt: requestedAt,
    },
  });

  console.log(
    '✅ Following: carol (public), dave (private, pending request to alice), kitchen (featured)',
  );
}

main()
  .catch((error: unknown) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
