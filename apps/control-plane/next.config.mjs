const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: isGitHubPages ? '/OpportunityOS' : '',
  assetPrefix: isGitHubPages ? '/OpportunityOS/' : undefined,
};

export default nextConfig;
