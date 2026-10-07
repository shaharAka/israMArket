"use client";
import type { ExamplePath } from "./businessExamples";
import { ProductFeatureShowcase } from "./ProductFeatureShowcase";
export function HeroWorkspace({ path }: { path: ExamplePath }) {
  return <ProductFeatureShowcase path={path} presentation="hero" />;
}
