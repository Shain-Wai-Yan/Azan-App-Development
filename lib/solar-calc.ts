// Pure mathematical implementation of solar prayer times
export type PrayerTimes = {
  fajr: string
  sunrise: string
  dhuhr: string
  asr: string
  maghrib: string
  isha: string
}

const d2r = (d: number) => (d * Math.PI) / 180
const r2d = (r: number) => (r * 180) / Math.PI

export function calculatePrayerTimes(
  lat: number,
  lng: number,
  timezone: number,
  date: Date = new Date(),
  fajrAngle = -18,
  ishaAngle = -18,
  asrShadow = 1 // 1 for Shafi, 2 for Hanafi
): PrayerTimes {
  // Day of the year
  const start = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  const N = Math.floor(diff / oneDay) + 1

  // Solar declination δ
  const delta = 23.45 * Math.sin(d2r((360 / 365) * (N - 81)))

  // Equation of Time (EoT)
  const B = (360 / 365) * (N - 81)
  const EoT =
    9.87 * Math.sin(d2r(2 * B)) -
    7.53 * Math.cos(d2r(B)) -
    1.5 * Math.sin(d2r(B))

  // Solar noon (Dhuhr)
  const solarNoon = 12 + timezone - lng / 15 - EoT / 60

  // Hour angle calculation
  const calculateHourAngle = (angle: number) => {
    const phi = d2r(lat)
    const d = d2r(delta)
    let cosH =
      (Math.sin(d2r(angle)) - Math.sin(phi) * Math.sin(d)) /
      (Math.cos(phi) * Math.cos(d))
    // Clamp to [-1, 1] to prevent NaN
    cosH = Math.min(1, Math.max(-1, cosH))
    return r2d(Math.acos(cosH))
  }

  // Format time to HH:MM AM/PM
  const formatTime = (hours: number) => {
    if (hours < 0) hours += 24
    if (hours >= 24) hours -= 24
    let h = Math.floor(hours)
    let m = Math.floor((hours - h) * 60)
    if (m === 60) {
      m = 0
      h += 1
    }
    const displayH = h % 24
    const period = displayH >= 12 ? "PM" : "AM"
    const finalH = displayH % 12 || 12
    return `${finalH}:${m.toString().padStart(2, "0")} ${period}`
  }

  // Fajr, Sunrise, Maghrib, Isha angles
  const Hfajr = calculateHourAngle(fajrAngle)
  const Hsunrise = calculateHourAngle(-0.833)
  const Hmaghrib = calculateHourAngle(-0.833)
  const Hisha = calculateHourAngle(ishaAngle)

  // Asr calculation (fixed)
  const phi = d2r(lat)
  const d = d2r(delta)
  const asrAltitude = -r2d(
    Math.atan(1 / (asrShadow + Math.tan(Math.abs(phi - d))))
  )
  const Hasr = calculateHourAngle(asrAltitude)

  return {
    fajr: Hfajr ? formatTime(solarNoon - Hfajr / 15) : "--:--",
    sunrise: Hsunrise ? formatTime(solarNoon - Hsunrise / 15) : "--:--",
    dhuhr: formatTime(solarNoon),
    asr: Hasr ? formatTime(solarNoon + Hasr / 15) : "--:--",
    maghrib: Hmaghrib ? formatTime(solarNoon + Hmaghrib / 15) : "--:--",
    isha: Hisha ? formatTime(solarNoon + Hisha / 15) : "--:--",
  }
}
