import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bettarrow",
    short_name: "Bettarrow",
    description: "Persönliches Trainingstagebuch für Krafttraining",
    start_url: "/",
    display: "standalone",
    background_color: "#101210",
    theme_color: "#101210",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
