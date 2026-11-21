/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["mysql2", "bcryptjs"],
  outputFileTracingRoot: import.meta.dirname,
};
export default nextConfig;
