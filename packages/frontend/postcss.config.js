/**
 * postcss.config.js — Tailwind v4 with Vite
 *
 * When using @tailwindcss/vite (the Vite plugin) you do NOT need PostCSS config.
 * The Vite plugin handles Tailwind, vendor prefixing, and Lightning CSS automatically.
 * autoprefixer is also no longer needed — Lightning CSS handles it.
 *
 * If you need PostCSS for other plugins, use @tailwindcss/postcss instead:
 *   plugins: { '@tailwindcss/postcss': {} }
 */
export default {
    plugins: {
        // No plugins needed when using the @tailwindcss/vite plugin in vite.config.ts
    },
};