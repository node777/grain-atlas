# Sky data attribution

- **stars.json, starnames.json** -- derived from the HYG Database v4.1 by David Nash (astronexus),
  https://github.com/astronexus/HYG-Database, licensed CC BY-SA 4.0. This derived file is shared
  under the same license. Stars to magnitude 6.5, plus fainter stars named by a figure.
- **figures-modern.json** -- Stellarium sky culture "modern", CC BY-SA 4.0.
- **figures-indian.json** -- Stellarium sky culture "indian", CC BY-SA 4.0.
- **figures-indian_nakshatras.json** -- Stellarium sky culture "indian_nakshatras", CC BY 4.0
  (figures after the 10th-century Tirupperunthurai temple carvings).
- **figures-chinese.json** -- Stellarium sky culture "chinese", CC BY-SA 4.0.
  Stellarium: https://github.com/Stellarium/stellarium/tree/master/skycultures
- **milkyway.json** -- from d3-celestial by Olaf Frohn (BSD-3-Clause), outline after the
  Milky Way catalog of Vieira et al.; simplified (every second vertex, 0.1° rounding).

Figures were filtered to integer HIP references present in the star file; Gaia-only references
in the upstream data are dropped.
