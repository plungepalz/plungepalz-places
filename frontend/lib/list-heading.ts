/** Location suffix: "worldwide" vs "in {area}". */
export function locationHeadingSuffix(locationName: string): string {
  if (locationName === 'the world' || locationName === 'worldwide') {
    return 'worldwide';
  }
  return `in ${locationName}`;
}

/**
 * List header. `total` is the API catalog count (plus any locally merged extras).
 * When the page is incomplete — `hasMore`, or shown count below `total` because
 * of the request limit / 1000-hit cap — use "Showing X of Y".
 */
export function placesListHeading(
  shown: number,
  total: number,
  locationName: string,
  options?: { hasMore?: boolean }
): string {
  const hasMore = Boolean(options?.hasMore);
  const incomplete = hasMore || shown < total;
  const noun = total === 1 ? 'place' : 'places';
  const where = locationHeadingSuffix(locationName);
  if (incomplete) {
    return `Showing ${shown} of ${total} ${noun} ${where}`;
  }
  return `${total} ${noun} ${where}`;
}
