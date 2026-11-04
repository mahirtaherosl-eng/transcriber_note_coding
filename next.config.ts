import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "archiver"],
  devIndicators: false,
};

export default nextConfig;
