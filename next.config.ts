import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "app.empleados2.0";
const githubPagesBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? `/${repositoryName}`;

const nextConfig: NextConfig = {
  // Solo en desarrollo: permite probar desde teléfonos en la red local (IP del PC).
  allowedDevOrigins: ['10.0.0.254', '10.0.0.21'],
  experimental: {
    // La importación de calendarios Excel envía el archivo a una Server Action (límite por defecto: 1 MB).
    serverActions: { bodySizeLimit: '5mb' },
  },
  // El service worker siempre se revisa en el servidor para que las actualizaciones lleguen.
  async headers() {
    return [{
      source: '/sw.js',
      headers: [
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
      ],
    }]
  },
  ...(isGitHubPages && {
    output: "export",
    basePath: githubPagesBasePath,
    trailingSlash: true,
    images: { unoptimized: true },
  }),
};

export default nextConfig;
