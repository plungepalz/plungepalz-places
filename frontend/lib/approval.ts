/** True only when the public API marks the place as admin-approved. */
export function isApproved(place: { is_approved: boolean }): boolean {
  return place.is_approved === true;
}
