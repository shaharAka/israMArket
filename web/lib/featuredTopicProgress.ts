/** A short list can be saved before it is ready for the next preparation step. */
export function maySavePartialTopics(itemCount: number, minimum: number, dirty: boolean): boolean {
  return dirty && itemCount > 0 && itemCount < minimum;
}

export function enoughFeaturedTopics(itemCount: number, minimum: number): boolean {
  return itemCount >= minimum;
}
