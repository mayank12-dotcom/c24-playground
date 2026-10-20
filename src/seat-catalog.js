import { jobs } from './application.js';
import { GARDEN_WORKSPACES } from './garden-layout.js';
import { SOCIAL_SEATS } from './social-layout.js';
import { FURNITURE_SEATS } from './furniture-seats.js';

// The same authoritative coordinates are used by the local client and both
// shared stores. Social companions keep their couch seats; free lounge seats
// use the same exclusive leases as application chairs.
export const SEAT_POSITIONS = Object.freeze(Object.fromEntries([
  ...jobs.map((job, index) => {
    const { x, z } = GARDEN_WORKSPACES[index];
    return [job.id, Object.freeze({ x, z: z + 1.5, rotation: Math.PI })];
  }),
  ...SOCIAL_SEATS.filter(seat => !seat.occupiedBy).map(seat => [seat.id,
    Object.freeze({ x: seat.x, z: seat.z, rotation: seat.rotation })]),
  ...FURNITURE_SEATS.map(seat => [seat.id,
    Object.freeze({ x: seat.x, z: seat.z, rotation: seat.rotation })]),
]));

export const SEAT_IDS = Object.freeze(Object.keys(SEAT_POSITIONS));
