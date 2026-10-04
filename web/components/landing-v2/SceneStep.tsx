import type { ReactNode } from "react";

/**
 * A step of a playing scene that the visitor can pick. ScenePlayer handles the click (one
 * listener for the page): it shows that step and stops the scene's autoplay. The button
 * stretches over its whole row, so the target is the row, never smaller than 44px.
 */
export function SceneStep({ index, children }: { index: number; children: ReactNode }) {
  return (
    <button type="button" data-step-to={index} className="lv2-scene-step">
      {children}
    </button>
  );
}
