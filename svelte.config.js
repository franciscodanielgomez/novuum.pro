import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';

const isTauriBuild = process.env.TAURI_BUILD === '1' || process.env.TAURI_BUILD === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: isTauriBuild
			? adapterStatic({ fallback: 'index.html' })
			: adapterAuto()
	}
};

export default config;
