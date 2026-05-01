import type { NextConfig } from "next";

const ffmpegTraceFiles = [
  "./node_modules/@ffmpeg-installer/*/ffmpeg",
  "./node_modules/@ffmpeg-installer/*/ffmpeg.exe",
  "./node_modules/@ffmpeg-installer/*/package.json",
  "./node_modules/@ffmpeg-installer/ffmpeg/index.js",
  "./node_modules/@ffmpeg-installer/ffmpeg/lib/verify-file.js",
  "./node_modules/@ffmpeg-installer/ffmpeg/package.json",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**": ffmpegTraceFiles,
  },
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
