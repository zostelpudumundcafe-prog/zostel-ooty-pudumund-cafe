/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow image domains if the customer wants to use external images for menu items
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
