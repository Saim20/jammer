import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Prevent Firebase from being bundled into the server/SSR bundle.
  // Firebase is a browser-only library in this project; all usage is
  // inside useEffect / event handlers which never run during prerendering.
  serverExternalPackages: ['firebase', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
