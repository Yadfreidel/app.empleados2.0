import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "app.empleados2.0";
const githubPagesBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? `/${repositoryName}`;

const nextConfig: NextConfig = {
  ...(isGitHubPages && {
    output: "export",
    basePath: githubPagesBasePath,
    trailingSlash: true,
    images: { unoptimized: true },
  }),
};

export default nextConfig;
