// A small gazetteer so a chart's place can be named and chosen without a network lookup.
// [name, lat, lon(east+)]. Add rows freely; nearestCity picks by great-circle distance.

export const CITIES: Array<[string, number, number]> = [
  ['Ujjain', 23.1793, 75.7849], ['Varanasi', 25.3176, 82.9739], ['Delhi', 28.6139, 77.209],
  ['Mumbai', 19.076, 72.8777], ['Kolkata', 22.5726, 88.3639], ['Chennai', 13.0827, 80.2707],
  ['Bengaluru', 12.9716, 77.5946], ['Hyderabad', 17.385, 78.4867], ['Ahmedabad', 23.0225, 72.5714],
  ['Pune', 18.5204, 73.8567], ['Jaipur', 26.9124, 75.7873], ['Ayodhya', 26.7922, 82.1998],
  ['Haridwar', 29.9457, 78.1642], ['Madurai', 9.9252, 78.1198], ['Thiruvananthapuram', 8.5241, 76.9366],
  ['Kathmandu', 27.7172, 85.324], ['Colombo', 6.9271, 79.8612], ['Dhaka', 23.8103, 90.4125],
  ['Karachi', 24.8607, 67.0011], ['Lahore', 31.5204, 74.3587], ['Kabul', 34.5553, 69.2075],
  ['Tehran', 35.6892, 51.389], ['Baghdad', 33.3152, 44.3661], ['Mecca', 21.3891, 39.8579],
  ['Cairo', 30.0444, 31.2357], ['Alexandria', 31.2001, 29.9187], ['Istanbul', 41.0082, 28.9784],
  ['Athens', 37.9838, 23.7275], ['Rome', 41.9028, 12.4964], ['Jerusalem', 31.7683, 35.2137],
  ['Babylon', 32.5364, 44.4208], ['Dubai', 25.2048, 55.2708], ['Riyadh', 24.7136, 46.6753],
  ['Nairobi', -1.2921, 36.8219], ['Lagos', 6.5244, 3.3792], ['Accra', 5.6037, -0.187],
  ['Addis Ababa', 8.9806, 38.7578], ['Johannesburg', -26.2041, 28.0473], ['Cape Town', -33.9249, 18.4241],
  ['Casablanca', 33.5731, -7.5898], ['Timbuktu', 16.7666, -3.0026], ['London', 51.5074, -0.1278],
  ['Greenwich', 51.4779, -0.0015], ['Paris', 48.8566, 2.3522], ['Berlin', 52.52, 13.405],
  ['Madrid', 40.4168, -3.7038], ['Lisbon', 38.7223, -9.1393], ['Amsterdam', 52.3676, 4.9041],
  ['Copenhagen', 55.6761, 12.5683], ['Stockholm', 59.3293, 18.0686], ['Oslo', 59.9139, 10.7522],
  ['Helsinki', 60.1699, 24.9384], ['Reykjavik', 64.1466, -21.9426], ['Dublin', 53.3498, -6.2603],
  ['Edinburgh', 55.9533, -3.1883], ['Vienna', 48.2082, 16.3738], ['Prague', 50.0755, 14.4378],
  ['Warsaw', 52.2297, 21.0122], ['Kyiv', 50.4501, 30.5234], ['Moscow', 55.7558, 37.6173],
  ['Zurich', 47.3769, 8.5417], ['Munich', 48.1351, 11.582], ['Barcelona', 41.3851, 2.1734],
  ['Beijing', 39.9042, 116.4074], ['Xi\'an', 34.3416, 108.9398], ['Shanghai', 31.2304, 121.4737],
  ['Hong Kong', 22.3193, 114.1694], ['Taipei', 25.033, 121.5654], ['Seoul', 37.5665, 126.978],
  ['Tokyo', 35.6762, 139.6503], ['Kyoto', 35.0116, 135.7681], ['Ulaanbaatar', 47.8864, 106.9057],
  ['Lhasa', 29.652, 91.1721], ['Bangkok', 13.7563, 100.5018], ['Hanoi', 21.0278, 105.8342],
  ['Singapore', 1.3521, 103.8198], ['Kuala Lumpur', 3.139, 101.6869], ['Jakarta', -6.2088, 106.8456],
  ['Bali', -8.3405, 115.092], ['Manila', 14.5995, 120.9842], ['Angkor', 13.4125, 103.867],
  ['Sydney', -33.8688, 151.2093], ['Melbourne', -37.8136, 144.9631], ['Perth', -31.9505, 115.8605],
  ['Auckland', -36.8485, 174.7633], ['Honolulu', 21.3069, -157.8583], ['Anchorage', 61.2181, -149.9003],
  ['Vancouver', 49.2827, -123.1207], ['Seattle', 47.6062, -122.3321], ['Portland', 45.5152, -122.6784],
  ['San Francisco', 37.7749, -122.4194], ['Los Angeles', 34.0522, -118.2437], ['San Diego', 32.7157, -117.1611],
  ['Phoenix', 33.4484, -112.074], ['Denver', 39.7392, -104.9903], ['Salt Lake City', 40.7608, -111.891],
  ['Bozeman', 45.677, -111.0429], ['Austin', 30.2672, -97.7431], ['Dallas', 32.7767, -96.797],
  ['Houston', 29.7604, -95.3698], ['Kansas City', 39.0997, -94.5786], ['Minneapolis', 44.9778, -93.265],
  ['Chicago', 41.8781, -87.6298], ['Detroit', 42.3314, -83.0458], ['Nashville', 36.1627, -86.7816],
  ['Atlanta', 33.749, -84.388], ['Miami', 25.7617, -80.1918], ['Orlando', 28.5383, -81.3792],
  ['Washington', 38.9072, -77.0369], ['Philadelphia', 39.9526, -75.1652], ['New York', 40.7128, -74.006],
  ['Boston', 42.3601, -71.0589], ['Toronto', 43.6532, -79.3832], ['Montreal', 45.5017, -73.5673],
  ['Mexico City', 19.4326, -99.1332], ['Chichen Itza', 20.6843, -88.5678], ['Havana', 23.1136, -82.3666],
  ['Bogota', 4.711, -74.0721], ['Lima', -12.0464, -77.0428], ['Cusco', -13.532, -71.9675],
  ['Quito', -0.1807, -78.4678], ['Santiago', -33.4489, -70.6693], ['Buenos Aires', -34.6037, -58.3816],
  ['Sao Paulo', -23.5505, -46.6333], ['Rio de Janeiro', -22.9068, -43.1729],
]

export function nearestCity(lat: number, lon: number): { name: string; km: number } | null {
  let best: { name: string; km: number } | null = null
  const r = Math.PI / 180
  for (const [name, la, lo] of CITIES) {
    const dLat = (la - lat) * r
    const dLon = (lo - lon) * r
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * r) * Math.cos(la * r) * Math.sin(dLon / 2) ** 2
    const km = 6371 * 2 * Math.asin(Math.sqrt(a))
    if (!best || km < best.km) best = { name, km }
  }
  return best
}
