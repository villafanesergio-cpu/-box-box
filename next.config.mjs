/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/posters/2026-10/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};
export default nextConfig;
