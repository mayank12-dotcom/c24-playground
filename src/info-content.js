/** The information gallery keeps content separate from its procedural objects. */
export const INFO_ROOM_BOUNDS = Object.freeze({ x: 0, z: 26, width: 14, depth: 10 });

const information = [
  {
    id: 'class24-story', label: 'Our story', kind: 'welcome', x: -4.6, z: 23.2, rotation: .38,
    title: 'Meet CARS24', summary: 'Welcome to the CARS24 corner.',
    sections: [{ title: 'The company', body: 'Welcome to CARS24. This space will introduce our story, our people, and the ideas that bring us together. There’s more to come.' }],
  },
  {
    id: 'class24-experience', label: 'What we do', kind: 'product', x: 4.5, z: 23.2, rotation: -.38,
    title: 'What we do', summary: 'A little introduction to the work.',
    sections: [{ title: 'The experience', body: 'Every idea has a story. This corner will offer a little look at what CARS24 does and the experiences we hope to create. We’ll share more soon.' }],
  },
  {
    id: 'class24-values', label: 'Our values', kind: 'values', x: -4.6, z: 27.6, rotation: Math.PI / 2,
    title: 'How we work', summary: 'Ideas to bring us together.',
    sections: [{ title: 'Ways of working', body: 'Good things grow from shared ideas. This board will introduce the values and everyday habits that shape CARS24. More stories are on their way.' }],
  },
  {
    id: 'class24-people', label: 'Our people', kind: 'people', x: 4.5, z: 27.6, rotation: -Math.PI / 2,
    title: 'People make the place', summary: 'A place for people and shared stories.',
    sections: [{ title: 'The team', body: 'There’s always a person behind the work. This space will celebrate the people, conversations, and small moments that make CARS24 feel like a community. Come back for more.' }],
  },
  {
    id: 'class24-careers', label: 'Find your place', kind: 'careers', x: 0, z: 29.7, rotation: Math.PI,
    title: 'Find your next chapter', summary: 'Your next chapter starts with a conversation.',
    sections: [{ title: 'Start a conversation', body: 'There are new chapters waiting to be written. This corner will share more about finding your place at CARS24. For now, take a walk and explore the garden.' }],
  },
];

/** Override content by object id without changing shared physical coordinates. */
export function createInfoContent(overrides = {}) {
  return information.map(item => {
    const update = overrides[item.id] || {};
    return Object.freeze({
      ...item, interactionRadius: 2.6, halfX: 1.08, halfZ: .68,
      ...Object.fromEntries(['label', 'title', 'summary'].filter(key => typeof update[key] === 'string').map(key => [key, update[key]])),
      sections: Object.freeze((update.sections || item.sections).map(section => Object.freeze({ title: section.title, body: section.body }))),
    });
  });
}

export const INFO_OBJECTS = Object.freeze(createInfoContent());

/** Interaction needs physical proximity; clicking a far exhibit never walks. */
export function getInfoInteraction(object, position) {
  const valid = !!object && !!position && [object.x, object.z, position.x, position.z].every(Number.isFinite);
  const distance = valid ? Math.hypot(position.x - object.x, position.z - object.z) : Infinity;
  const radius = Number.isFinite(object?.interactionRadius) && object.interactionRadius > 0 ? object.interactionRadius : 2.6;
  return { allowed: valid && distance <= radius, distance, object: object || null };
}
