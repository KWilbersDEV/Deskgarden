import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const ENVIRONMENTS = {
  development: { outDir: 'build/development', previewPort: 4174 },
  production: { outDir: 'build/production', previewPort: 4173 },
} as const;

type AppEnv = keyof typeof ENVIRONMENTS;

export default defineConfig(({ mode }) => {
  // .env files live next to this config, wherever the command is run from.
  const env = loadEnv(mode, decodeURIComponent(new URL('.', import.meta.url).pathname), 'VITE_');
  const appEnv = env.VITE_APP_ENV as AppEnv;

  // Fail loudly instead of building with a missing or mismatched environment,
  // e.g. `--mode staging` with no .env.staging, or an env file that says the wrong thing.
  if (!(appEnv in ENVIRONMENTS) || appEnv !== mode) {
    throw new Error(
      `Desk Garden: mode "${mode}" must set VITE_APP_ENV to "${mode}" in .env.${mode} ` +
        `(expected one of: ${Object.keys(ENVIRONMENTS).join(', ')}; got "${env.VITE_APP_ENV ?? ''}").`,
    );
  }

  const target = ENVIRONMENTS[appEnv];
  const isProduction = appEnv === 'production';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // Build output and the desktop app's Rust build are not app source; watching them is slow,
      // especially through a Docker bind mount.
      watch: { ignored: ['**/build/**', '**/release/**', '**/src-tauri/**'] },
    },
    preview: { port: target.previewPort, strictPort: true },
    build: {
      // Each environment has its own folder, so one build can never overwrite the other.
      outDir: target.outDir,
      emptyOutDir: true,
      // The development build stays readable for testing; production is minified without source maps.
      sourcemap: !isProduction,
      minify: isProduction,
    },
  };
});
