/**
 * upload-to-cloudinary.ts
 *
 * ONE-TIME MIGRATION SCRIPT — uploads all recipe images from Unsplash to your
 * Cloudinary account and prints the mapping of recipe_id → cloudinary_url.
 *
 * Prerequisites:
 *   1. Create a free account at https://cloudinary.com
 *   2. Set env vars in apps/api/.env:
 *        CLOUDINARY_CLOUD_NAME=your_cloud_name
 *        CLOUDINARY_API_KEY=your_api_key
 *        CLOUDINARY_API_SECRET=your_api_secret
 *   3. Run: npx tsx scripts/upload-to-cloudinary.ts
 *
 * After running:
 *   1. Replace UNSPLASH_BASE URLs in week-plan.fixture.ts and
 *      swap-recipes.fixture.ts with the printed Cloudinary URLs.
 *   2. Re-generate meal plans so the DB gets the Cloudinary URLs.
 *   3. Add NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME to apps/web/.env.local.
 */

import { v2 as cloudinary } from 'cloudinary';

// ─── Configure ────────────────────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'],
  api_key: process.env['CLOUDINARY_API_KEY'],
  api_secret: process.env['CLOUDINARY_API_SECRET'],
  secure: true,
});

// ─── Recipe → Unsplash image map ─────────────────────────────────────────────

const RECIPE_IMAGES: { id: string; name: string; unsplashUrl: string }[] = [
  // Week plan — 14 recipes
  {
    id: 'fix-r-001',
    name: 'Greek Yogurt Parfait with Berries',
    unsplashUrl:
      'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-002',
    name: 'Avocado Toast with Poached Eggs',
    unsplashUrl:
      'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-003',
    name: 'Overnight Oats with Banana and Almond Butter',
    unsplashUrl:
      'https://images.unsplash.com/photo-1517673408408-cb25f2e0fb8a?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-004',
    name: 'Spinach and Feta Omelette',
    unsplashUrl:
      'https://images.unsplash.com/photo-1510693206972-df098062cb71?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-005',
    name: 'Grilled Chicken Caesar Salad',
    unsplashUrl:
      'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-006',
    name: 'Quinoa and Roasted Vegetable Bowl',
    unsplashUrl:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-007',
    name: 'Turkey and Avocado Whole-Wheat Wrap',
    unsplashUrl:
      'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-008',
    name: 'Herb-Crusted Salmon with Roasted Asparagus',
    unsplashUrl:
      'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-009',
    name: 'Chicken and Vegetable Stir-Fry with Brown Rice',
    unsplashUrl:
      'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-010',
    name: 'Mediterranean Baked Cod with Tomatoes',
    unsplashUrl:
      'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-011',
    name: 'Red Lentil and Spinach Curry',
    unsplashUrl:
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-012',
    name: 'Apple Slices with Almond Butter',
    unsplashUrl:
      'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-013',
    name: 'Banana Protein Smoothie',
    unsplashUrl:
      'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'fix-r-014',
    name: 'Mixed Nuts and Medjool Dates',
    unsplashUrl:
      'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=800&h=600&q=80',
  },
  // Swap pool — 8 recipes
  {
    id: 'swap-b-001',
    name: 'Banana Oat Pancakes',
    unsplashUrl:
      'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'swap-b-002',
    name: 'Smoked Salmon Bagel',
    unsplashUrl:
      'https://images.unsplash.com/photo-1606851091851-e8c8c0fca5ba?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'swap-l-001',
    name: 'Lentil & Roasted Veg Salad',
    unsplashUrl:
      'https://images.unsplash.com/photo-1540189549336-e6e99eb4f7c9?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'swap-l-002',
    name: 'Tuna & Chickpea Bowl',
    unsplashUrl:
      'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'swap-d-001',
    name: 'Turkey & Vegetable Meatballs',
    unsplashUrl:
      'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'swap-d-002',
    name: 'Black Bean & Sweet Potato Tacos',
    unsplashUrl:
      'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'swap-s-001',
    name: 'Hummus & Veggie Sticks',
    unsplashUrl:
      'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&h=600&q=80',
  },
  {
    id: 'swap-s-002',
    name: 'Cottage Cheese & Pineapple',
    unsplashUrl:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&h=600&q=80',
  },
];

// ─── Upload ───────────────────────────────────────────────────────────────────

async function upload() {
  console.log(`\n☁️  Uploading ${RECIPE_IMAGES.length} recipe images to Cloudinary…\n`);

  const results: { id: string; name: string; cloudinaryUrl: string }[] = [];

  for (const recipe of RECIPE_IMAGES) {
    try {
      const result = await cloudinary.uploader.upload(recipe.unsplashUrl, {
        public_id: `chefer/recipes/${recipe.id}`,
        overwrite: true,
        transformation: [
          { width: 800, height: 600, crop: 'fill', gravity: 'auto' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
        tags: ['chefer', 'recipe'],
      });

      const url = cloudinary.url(`chefer/recipes/${recipe.id}`, {
        transformation: [
          { width: 800, height: 600, crop: 'fill', gravity: 'auto' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      });

      results.push({ id: recipe.id, name: recipe.name, cloudinaryUrl: url });
      console.log(`  ✅ ${recipe.id} — ${recipe.name}`);
      console.log(`     ${result.secure_url}`);
    } catch (err) {
      console.error(`  ❌ ${recipe.id} — ${recipe.name}: ${String(err)}`);
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Update imageUrl values in your fixtures with these Cloudinary URLs:');
  console.log('─────────────────────────────────────────────────────────────────\n');
  for (const r of results) {
    console.log(`'${r.id}': '${r.cloudinaryUrl}',`);
  }
  console.log('\n✨ Done! Regenerate your meal plan to persist new URLs to the DB.');
}

upload().catch(console.error);
