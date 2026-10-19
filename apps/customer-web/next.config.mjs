/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@bravoforest/ui'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'commons.wikimedia.org' }
    ]
  }
};
export default nextConfig;
