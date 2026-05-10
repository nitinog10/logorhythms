/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['avatars.githubusercontent.com', 'github.com'],
  },
  async redirects() {
    return [
      {
        source: '/builder',
        destination: '/studio',
        permanent: true,
      },
      {
        source: '/builder/:projectId',
        destination: '/studio/:projectId',
        permanent: true,
      },
      {
        source: '/repositories',
        destination: '/settings/integrations',
        permanent: false,
      },
      {
        source: '/repositories/:id',
        destination: '/studio/from-repo/:id',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
