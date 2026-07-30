import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const githubPagesBasePath = "/messenger";

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    root: process.cwd(),
  },
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: isGitHubPages ? githubPagesBasePath : "",
  },
  ...(isGitHubPages
    ? {
        basePath: githubPagesBasePath,
        assetPrefix: `${githubPagesBasePath}/`,
      }
    : {}),
};

export default nextConfig;
