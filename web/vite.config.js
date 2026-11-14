import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the build work on Vercel, Netlify, GitHub Pages or any static host
export default defineConfig({ base: "./", plugins: [react()] });
