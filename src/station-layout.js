/** Physical footprints shared by manual walking and explicit chair routing. */
export const SEAT_APPROACH_OFFSET = .74;

export function getStationColliders(positions) {
  return positions.flatMap(([x, z], stationIndex) => [
    { x, z, halfX: 1.225, halfZ: .65, kind: 'desk', stationIndex },
    { x, z: z - 1.12, halfX: .41, halfZ: .38, kind: 'recruiter-chair', stationIndex },
    { x, z: z + 1.5, halfX: .41, halfZ: .38, kind: 'applicant-chair', stationIndex },
  ]);
}
