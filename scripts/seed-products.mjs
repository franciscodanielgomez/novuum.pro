/**
 * Seed products into Supabase using .env credentials.
 * Products are linked to categories by name (category in JSON).
 *
 * Usage: node scripts/seed-products.mjs [path/to/products-data.json]
 *
 * Supabase order (SQL Editor):
 *   1) categories.sql
 *   2) categories_seed.sql (optional)
 *   3) products_category_fk.sql
 * Then: node scripts/seed-products.mjs
 *
 * .env: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or PUBLIC_SUPABASE_ANON_KEY)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
	try {
		const envPath = resolve(__dirname, '..', '.env');
		const raw = readFileSync(envPath, 'utf8');
		for (const line of raw.split('\n')) {
			const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
			if (m) {
				const key = m[1];
				const val = m[2].replace(/^["']|["']$/g, '').trim();
				if (!process.env[key]) process.env[key] = val;
			}
		}
	} catch (e) {
		console.warn('.env not found, using process.env');
	}
}

async function main() {
	await loadEnv();

	const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

	if (!url) {
		console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_URL in .env');
		process.exit(1);
	}

	const key = serviceKey || anonKey;
	if (!key) {
		console.error('Missing SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_ANON_KEY in .env');
		process.exit(1);
	}

	const supabase = createClient(url, key);

	// Load categories to resolve name -> id
	const { data: categories, error: catError } = await supabase
		.from('categories')
		.select('id, name');
	if (catError || !categories?.length) {
		console.error('Could not load categories. Run categories.sql and categories_seed.sql first.', catError?.message || '');
		process.exit(1);
	}
	const nameToId = new Map();
	for (const c of categories) {
		const k = String(c.name ?? '').trim().toUpperCase();
		if (k) nameToId.set(k, c.id);
	}
	console.log('Categories loaded:', nameToId.size);

	const dataPath = resolve(__dirname, process.argv[2] || 'products-data.json');
	let rows;
	try {
		const json = readFileSync(dataPath, 'utf8');
		rows = JSON.parse(json);
	} catch (e) {
		console.error('Error reading', dataPath, e.message);
		process.exit(1);
	}

	if (!Array.isArray(rows)) {
		console.error('JSON must be an array of { category, description, price }');
		process.exit(1);
	}

	const toInsert = [];
	const skipped = [];
	for (const r of rows) {
		const catName = String(r.category ?? r.categoria ?? '').trim();
		const name = String(r.description ?? r.descripcion ?? r.name ?? '').trim();
		const price = Number(r.price ?? r.precio ?? 0);
		if (!name) continue;
		const categoryId = catName ? nameToId.get(catName.toUpperCase()) : null;
		if (!categoryId) {
			skipped.push({ category: catName || '(no category)', description: name });
			continue;
		}
		toInsert.push({
			category_id: categoryId,
			name,
			description: name,
			price,
			active: true
		});
	}
	if (skipped.length) {
		console.warn('Skipped (category not found in DB):', skipped.length);
		skipped.slice(0, 5).forEach((s) => console.warn('  -', s.category, '|', s.description));
		if (skipped.length > 5) console.warn('  ... and', skipped.length - 5, 'more');
	}

	if (toInsert.length === 0) {
		console.error('No valid rows with existing category. Ensure category name matches the categories table.');
		process.exit(1);
	}

	console.log('Inserting', toInsert.length, 'products...');

	const BATCH = 50;
	let ok = 0;
	let err = 0;
	for (let i = 0; i < toInsert.length; i += BATCH) {
		const chunk = toInsert.slice(i, i + BATCH);
		const productRows = chunk.map(({ name, description, price, active }) => ({ name, description, price, active }));
		const { data: inserted, error: prodError } = await supabase.from('products').insert(productRows).select('id');
		if (prodError) {
			console.error('Products batch error', i + 1, '-', prodError.message);
			err += chunk.length;
			continue;
		}
		ok += inserted?.length ?? 0;
		// Link to categories (many-to-many)
		if (inserted?.length && inserted.length === chunk.length) {
			const links = chunk.map((row, j) => ({ product_id: inserted[j].id, category_id: row.category_id }));
			const { error: linkError } = await supabase.from('product_categories').insert(links);
			if (linkError) console.warn('product_categories batch', i + 1, linkError.message);
		}
	}

	console.log('Done. Inserted:', ok, err ? `Errors: ${err}` : '');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
