import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// Load .env.local from the PROJECT ROOT (one level up from app/).
//
// Lisa's canonical secrets file lives at:
//   C:\Users\lisak\ComposeApp\.env.local
// (one level above the Next.js app). Next.js's built-in loadEnvConfig
// only reads from the app/ directory, so without this hook the
// project-root file is silently ignored — every secret in it
// (ANTHROPIC_API_KEY, FOXIT_SDK_SN, ESIGN_*, etc.) appears unset to
// the running server.
//
// This config-time hook reads that file and injects each var into
// process.env BEFORE any route handler runs. Project root is the
// single source of truth — we always override what's in process.env
// so the stale app/.env.local can't shadow Lisa's canonical secrets.
//
// Lisa chose this layout deliberately. We honor the choice in code
// rather than asking her to maintain two copies.
try {
  const projectRootEnv = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(projectRootEnv)) {
    const content = fs.readFileSync(projectRootEnv, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Project root wins. Always override.
      process.env[key] = value;
    }
  }
} catch {
  // Defensive: never fail config load on env-file problems.
  // The app will surface the missing-key error at request time
  // (anthropic.ts throws a clear "ANTHROPIC_API_KEY not found").
}

const nextConfig: NextConfig = {
  // Allow native .node modules (Foxit SDK) to work server-side. Puppeteer is
  // external too — it must run from node_modules unbundled (the Design critic's
  // render-to-PNG launches headless Chromium server-side).
  serverExternalPackages: ['@foxitsoftware/foxit-pdf-sdk-node', '@foxitsoftware/foxit-pdf-conversion-sdk-node', 'puppeteer', 'puppeteer-core', 'opentype.js'],

  // /compose was renamed to /studio (2026-06-10, "route follows nav label").
  // Redirect old paths so any stale link/bookmark still lands in the right place.
  async redirects() {
    return [
      { source: '/compose', destination: '/studio', permanent: true },
      { source: '/compose/:path*', destination: '/studio/:path*', permanent: true },
    ];
  },

  // Pin Turbopack's workspace root to THIS directory (app/).
  //
  // Without this, Next.js 16 detected a stray package-lock.json at
  // C:\Users\lisak\ComposeApp\ (the project root, NOT the Next.js app
  // root) and silently picked it as the workspace root. That broke
  // API route resolution — every /api/* request 404'd
  // (generate-cards, foxit/init, suggest-context, etc.) because
  // Turbopack was looking for them from the wrong base directory.
  // Pages still worked, which is why the bug looked like "API only".
  //
  // `__dirname` resolves to the directory of this config file, i.e.
  // C:\Users\lisak\ComposeApp\app\ — the correct workspace root.
  turbopack: {
    root: __dirname,
  },

  // Webpack-only fallback (this worktree runs `next dev --webpack` because its
  // node_modules is a symlink/junction to the main repo, which Turbopack
  // rejects). pptxgenjs (via src/lib/pptxExport.ts → CardEditor) statically
  // pulls Node builtins like `node:fs`/`node:https` into the client bundle;
  // Turbopack tree-shakes these for the browser automatically, webpack does not.
  // Strip the `node:` scheme and no-op the server-only builtins client-side.
  // This hook is IGNORED under Turbopack (the default on main), so it's harmless
  // to the normal build.
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false, https: false, http: false, path: false, os: false,
        crypto: false, stream: false, zlib: false, child_process: false,
        net: false, tls: false, http2: false,
      };
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, '');
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
