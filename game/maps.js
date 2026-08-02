export const MAPS = {
  downtown: {
    name: 'downtown',
    grid: [
      "####################", // Row 0
      "#,,,,,,,,,,,,,,,,,,#", // Row 1  (Neon Alley running along the top)
      "#,,######..######,,#", // Row 2  (Neon Alleys wrapping the Safehouse)
      "#..#....#..#....#..#", // Row 3
      "#..#....#..#....#..#", // Row 4
      "#..###==#..#....#..#", // Row 5
      "#.......#..#....#..#", // Row 6
      "#####.###..######..#", // Row 7
      "#,,,,,,,,,,,,,,,,,,#", // Row 8  (A vibrant neon cross-street)
      "#..................#", // Row 9
      "#....~~~~~~~~~~....#", // Row 10 
      "#....~~~~~~~~~~....#", // Row 11
      "#..................#", // Row 12
      "######..############", // Row 13 
      "#,,,,,,,,,,,,,,,,,,#", // Row 14 (Another neon cross-street)
      "#....##########....#", // Row 15 
      "#....#........#....#", // Row 16
      "#....#........#....#", // Row 17
      "#..................#", // Row 18
      "####################"  // Row 19
    ],
    legend: {
      '#': { name: 'Chrome wall', desc: 'A towering corporate barrier made of dark glass.', blocked: true },
      '.': { name: 'Cracked asphalt', desc: 'Dimly lit streets smelling of ozone.', blocked: false },
      ',': { name: 'Neon Alley', desc: 'A narrow corridor illuminated by buzzing hot pink advertisements.', blocked: false },
      '~': { name: 'Chemical Sludge', desc: 'Sizzling green industrial runoff. Smells like sulfur.', blocked: false },
      '=': { name: 'Laser Gate', desc: 'A humming matrix of security fields. Looks impassable.', blocked: true }
    }
  }
};