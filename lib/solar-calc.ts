// Pure mathematical implementation of solar prayer times
export type PrayerTimes = {
  fajr: string
  sunrise: string
  dhuhr: string
  asr: string
  maghrib: string
  isha: string
}

/**
 * Constants and Utility Functions
 */
const d2r = (d: number) => (d * Math.PI) / 180
const r2d = (r: number) => (r * 180) / Math.PI

export function calculatePrayerTimes(
  lat: number,
  lng: number,
  timezone: number,
  date: Date = new Date(),
  fajrAngle = -18,
  ishaAngle = -18,
  asrShadow = 1 // 1: Shafi/Maliki/Hanbali, 2: Hanafi
): PrayerTimes {
  
  // 1. Calculate Day of the Year (N)
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  const N = Math.floor(diff / oneDay)

  // 2. Solar Calculations
  // B represents the fractional year in degrees
  const B = (360 / 365) * (N - 81)
  
  // Solar Declination (delta)
  const delta = 23.45 * Math.sin(d2r(B))

  // Equation of Time (EoT) in minutes
  const EoT = 9.87 * Math.sin(d2r(2 * B)) - 7.53 * Math.cos(d2r(B)) - 1.5 * Math.sin(d2r(B))

  // 3. Solar Noon (Dhuhr)
  // Base calculation: 12 + Timezone - (Longitude / 15) - (EoT / 60)
  // We add a small buffer (approx 1-2 mins) to ensure the sun has passed the meridian
  const dhuhrTime = 12 + timezone - lng / 15 - EoT / 60
  const solarNoon = dhuhrTime + (2 / 60) 

  /**
   * Universal Hour Angle (H) Formula
   * Finds the time offset from solar noon for a given solar altitude (a)
   */
  const getHourAngle = (angle: number) => {
    const phi = d2r(lat)
    const d = d2r(delta)
    const a = d2r(angle)
    
    let cosH = (Math.sin(a) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d))
    
    // Safety check for latitudes where the sun doesn't reach certain angles
    if (cosH > 1) return null // Sun never rises to this angle
    if (cosH < -1) return null // Sun never sets below this angle
    
    return r2d(Math.acos(cosH))
  }

  // 4. Calculate Asr Altitude (The fix)
  // Formula: cot(a) = n + tan(|lat - delta|)
  const phi = d2r(lat)
  const d = d2r(delta)
  const asrAltitude = r2d(Math.atan(1 / (asrShadow + Math.tan(Math.abs(phi - d)))))

  // 5. Compute Hour Angles for each event
  const hFajr = getHourAngle(fajrAngle)
  const hSunrise = getHourAngle(-0.833)
  const hAsr = getHourAngle(asrAltitude)
  const hMaghrib = getHourAngle(-0.833)
  const hIsha = getHourAngle(ishaAngle)

  /**
   * Time Formatting Utility
   */
  const formatTime = (hours: number | null) => {
    if (hours === null) return "--:--"
    
    // Wrap hours around 24h clock
    let h24 = (hours + 24) % 24
    let h = Math.floor(h24)
    let m = Math.round((h24 - h) * 60)
    
    if (m === 60) {
      m = 0
      h = (h + 1) % 24
    }

    const period = h >= 12 ? "PM" : "AM"
    const h12 = h % 12 || 12
    return `${h12}:${m.toString().padStart(2, "0")} ${period}`
  }

  return {
    fajr: formatTime(solarNoon - (hFajr || 0) / 15),
    sunrise: formatTime(solarNoon - (hSunrise || 0) / 15),
    dhuhr: formatTime(solarNoon),
    asr: formatTime(solarNoon + (hAsr || 0) / 15),
    maghrib: formatTime(solarNoon + (hMaghrib || 0) / 15),
    isha: formatTime(solarNoon + (hIsha || 0) / 15),
  }
}