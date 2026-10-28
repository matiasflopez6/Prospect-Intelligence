import type { NextConfig } from "next";

const config: NextConfig = {
  // Módulo nativo: no debe empaquetarse.
  serverExternalPackages: ["better-sqlite3"],
  reactStrictMode: true,
};

export default config;
