/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@modelcontextprotocol/sdk'],
  async rewrites() {
    return [
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/mcp/oauth/protected-resource',
      },
      {
        source: '/.well-known/oauth-protected-resource/:path*',
        destination: '/api/mcp/oauth/protected-resource',
      },
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/mcp/oauth/authorization-server',
      },
      {
        source: '/.well-known/oauth-authorization-server/:path*',
        destination: '/api/mcp/oauth/authorization-server',
      },
    ]
  },
}

export default nextConfig
