"use client";
import type { ExamplePath } from "./businessExamples";
import { ProductFeatureShowcase } from "./ProductFeatureShowcase";
export function HeroProduct({ path }: { path: ExamplePath }) {
  return <ProductFeatureShowcase path={path} presentation="hero" />;
}
