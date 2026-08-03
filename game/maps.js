export const MAPS = {
  downtown: {
    name: 'downtown',
    grid: [
      "########################################", // Row 0
      "#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#", // Row 1 (High-density upper Neon Alley)
      "#,,##################..##############,,#", // Row 2
      "#..#................#..#............#..#", // Row 3
      "#..#................#..#............#..#", // Row 4
      "#..#....H...........#..#............#..#", // Row 5 (H = Safehouse / Medical Hub area)
      "#..#................#..#............#..#", // Row 6
      "#..##################..##############..#", // Row 7
      "#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#", // Row 8 (Vibrant neon cross-street)
      "#......................................#", // Row 9
      "#....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....#", // Row 10 (Massive central toxic runoff pools)
      "#....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....#", // Row 11
      "#......................................#", // Row 12
      "#######..######################..#######", // Row 13 (Checkpoint bottlenecks)
      "#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#", // Row 14 (Lower neon promenade)
      "#....##########..........##########....#", // Row 15
      "#....#........#..........#........#....#", // Row 16
      "#....#........#..........#........#....#", // Row 17
      "#....#........#..........#........#....#", // Row 18
      "#....##########..........##########....#", // Row 19
      "#......................................#", // Row 20
      "#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#", // Row 21 (Industrial district alleyways)
      "#......................................#", // Row 22
      "#......................................#", // Row 23
      "########################################"  // Row 24
    ],
    legend: {
      '#': { name: 'Chrome wall', desc: 'A towering corporate barrier made of dark glass.', blocked: true },
      '.': { name: 'Cracked asphalt', desc: 'Dimly lit streets smelling of ozone.', blocked: false },
      ',': { name: 'Neon Alley', desc: 'A narrow corridor illuminated by buzzing hot pink advertisements.', blocked: false },
      '~': { name: 'Chemical Sludge', desc: 'Sizzling green industrial runoff. Smells like sulfur.', blocked: false },
      '=': { name: 'Laser Gate', desc: 'A humming matrix of security fields. Looks impassable.', blocked: true },
      'H': { name: 'Safehouse Hub', desc: 'A secure neural enclave. Weapons are deactivated here.', blocked: false }
    }
  }
};