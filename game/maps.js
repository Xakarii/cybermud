export const MAPS = {
  downtown: {
    name: 'downtown',
    // Visually design your 20x20 street grid directly in your code
    grid: [
      "####################", // Row 0
      "#..................#", // Row 1
      "#..######..######..#", // Row 2  (Spawn Safehouse building)
      "#..#....#..#....#..#", // Row 3
      "#..#....#..#....#..#", // Row 4
      "#..###==#..#....#..#", // Row 5  (Laser Gate exit)
      "#.......#..#....#..#", // Row 6
      "#####.###..######..#", // Row 7
      "#..................#", // Row 8
      "#..................#", // Row 9
      "#....~~~~~~~~~~....#", // Row 10 (Acid chemical run-off alley)
      "#....~~~~~~~~~~....#", // Row 11
      "#..................#", // Row 12
      "######..############", // Row 13 (Narrow chokepoint)
      "#..................#", // Row 14
      "#....##########....#", // Row 15 (Corporate Plaza)
      "#....#........#....#", // Row 16
      "#....#........#....#", // Row 17
      "#..................#", // Row 18
      "####################"  // Row 19
    ],
    // Map individual visual characters to full interactive tile data objects
    legend: {
      '#': { name: 'Chrome wall', desc: 'A towering corporate barrier made of dark glass.', blocked: true },
      '.': { name: 'Cracked asphalt', desc: 'Neon reflects in puddles of toxic rain.', blocked: false },
      '~': { name: 'Chemical Sludge', desc: 'Sizzling green industrial runoff. Smells like sulfur.', blocked: false },
      '=': { name: 'Laser Gate', desc: 'A humming matrix of security fields. Looks impassable.', blocked: true }
    }
  }
};