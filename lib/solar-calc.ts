// prayer-times-advanced.ts
export type PrayerTimes = {
  fajr: string
  sunrise: string
  dhuhr: string
  asr: string
  maghrib: string
  isha: string
  // numeric minutes since midnight local (useful for scheduling)
  _mins?: { fajr:number; sunrise:number; dhuhr:number; asr:number; maghrib:number; isha:number }
}

export enum CalcMethod {
  MWL = "MWL",
  Karachi = "Karachi",
  Egypt = "Egypt",
  UmmAlQura = "UmmAlQura",
  Custom = "Custom",
}

const d2r = (d: number) => (d * Math.PI) / 180
const r2d = (r: number) => (r * 180) / Math.PI
const clamp = (v:number, a=-1, b=1) => Math.max(a, Math.min(b, v))

// Calculation presets (angles in degrees)
const METHOD_ANGLES: Record<CalcMethod, { fajr: number; isha: number }> = {
  [CalcMethod.MWL]: { fajr: -18, isha: -17 },
  [CalcMethod.Karachi]: { fajr: -18, isha: -18 },
  [CalcMethod.Egypt]: { fajr: -19.5, isha: -17.5 },
  [CalcMethod.UmmAlQura]: { fajr: -18.5, isha: -90 }, // UmmAlQura uses fixed Isha time — treat specially if desired
  [CalcMethod.Custom]: { fajr: -18, isha: -18 },
}

// compute fractional day-of-year (N + fraction-of-day) using UTC time
function dayOfYearFractionUTC(date: Date, localOffsetHours: number, localHour:number): number {
  // Start of year in UTC
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  // we will compute a Date at local time localHour to convert to UTC fractional day
  // but simpler: get UTC hours for given localHour: utcHour = localHour - tz
  const utcHour = localHour - localOffsetHours
  // compute day index (1..365/366) for the local date, but we need fractional based on UTC time
  const dayIndex = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000) + 1
  const fraction = (utcHour) / 24
  return dayIndex + fraction
}

// compute declination & EoT given fractional day Nf (1..365 + fraction)
function declinationAndEoTFromNf(Nf: number) {
  // Use the familiar approximations (B in degrees)
  const B = (360 / 365) * (Nf - 81)
  const Brad = d2r(B)
  const delta = 23.45 * Math.sin(d2r((360 / 365) * (Nf - 81))) // degrees
  const EoT = 9.87 * Math.sin(2 * Brad) - 7.53 * Math.cos(Brad) - 1.5 * Math.sin(Brad) // minutes
  return { delta, EoT }
}

function formatHM(hoursFloat: number) {
  // normalize
  hoursFloat = (hoursFloat % 24 + 24) % 24
  let h = Math.floor(hoursFloat)
  let m = Math.round((hoursFloat - h) * 60)
  if (m === 60) {
    m = 0
    h = (h + 1) % 24
  }
  const period = h >= 12 ? "PM" : "AM"
  const displayH = h % 12 || 12
  return `${displayH}:${m.toString().padStart(2,"0")} ${period}`
}

function hoursToMins(hours:number){ return Math.round(hours*60) }
function minsToHours(mins:number){ return mins/60 }

// compute hour angle H (degrees) for given solar altitude angle (alpha)
function hourAngleDeg(latDeg:number, declDeg:number, alphaDeg:number) {
  const phi = d2r(latDeg)
  const d = d2r(declDeg)
  const cosH = clamp((Math.sin(d2r(alphaDeg)) - Math.sin(phi)*Math.sin(d)) / (Math.cos(phi)*Math.cos(d)))
  return r2d(Math.acos(cosH)) // degrees
}

// Asr altitude (negative) in degrees given shadow factor (1 or 2)
function asrAltitudeDeg(latDeg:number, declDeg:number, shadowFactor:number) {
  const phi = d2r(latDeg)
  const d = d2r(declDeg)
  // asrAltitude = -atan(1 / (shadow + tan(|phi - d|)))
  const val = Math.atan(1 / (shadowFactor + Math.tan(Math.abs(phi - d))))
  return -r2d(val)
}

/**
 * Main function. timezone is hours offset from UTC (e.g. Myanmar +6.5)
 * method controls default angles (you can override fajrAngle/ishaAngle by passing Custom and values)
 */
export function calculatePrayerTimesAdvanced(
  lat: number,
  lng: number,
  timezone: number,
  date: Date = new Date(),
  method: CalcMethod = CalcMethod.MWL,
  asrShadow: 1 | 2 = 1,
  customFajrAngle?: number,
  customIshaAngle?: number,
): PrayerTimes {
  // choose angles
  const methodAngles = METHOD_ANGLES[method]
  const fajrAngle = (method === CalcMethod.Custom && customFajrAngle !== undefined) ? customFajrAngle : methodAngles.fajr
  const ishaAngle = (method === CalcMethod.Custom && customIshaAngle !== undefined) ? customIshaAngle : methodAngles.isha

  // helper to compute declination/EoT at a local hour (local time in hours)
  const getSolarAtLocalHour = (localHour:number) => {
    // compute fractional day Nf using UTC-equivalent for that local hour
    // localHour is in local time (0..24). Convert to UTC fractional by subtracting timezone.
    const Nf = (function(){
      const start = Date.UTC(date.getUTCFullYear(), 0, 1)
      const dayIndex = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000) + 1
      const utcHour = localHour - timezone
      // if utcHour falls outside 0..24 adjust dayIndex accordingly
      let fracDay = utcHour / 24
      // if utcHour <0 move to previous UTC day
      if (utcHour < 0) {
        return dayIndex - 1 + (utcHour + 24) / 24
      } else if (utcHour >= 24) {
        return dayIndex + 1 + (utcHour - 24) / 24
      }
      return dayIndex + fracDay
    })()
    return declinationAndEoTFromNf(Nf)
  }

  // initial declination/EoT at noon local (start point)
  const solarAtNoon = getSolarAtLocalHour(12)
  let delta = solarAtNoon.delta
  let EoT = solarAtNoon.EoT

  // initial solarNoon (local hours)
  let solarNoon = 12 + timezone - lng / 15 - EoT / 60

  // function to iterate for a target angle (alpha) and whether before noon (-) or after (+)
  const solvePrayer = (alphaDeg:number, beforeNoon:boolean) => {
    // initial estimate using current delta
    let H = hourAngleDeg(lat, delta, alphaDeg)
    let t = beforeNoon ? solarNoon - H/15 : solarNoon + H/15

    // iterate 3 times: recompute declination & EoT at this local time and re-solve
    for (let i=0;i<3;i++){
      const solar = getSolarAtLocalHour(t)
      delta = solar.delta
      EoT = solar.EoT
      solarNoon = 12 + timezone - lng/15 - EoT / 60
      H = hourAngleDeg(lat, delta, alphaDeg)
      t = beforeNoon ? solarNoon - H/15 : solarNoon + H/15
    }
    return t
  }

  // compute times
  // Fajr (before sunrise)
  const fajrLocal = solvePrayer(fajrAngle, true)

  // Sunrise
  const sunriseLocal = solvePrayer(-0.833, true)

  // Dhuhr -> recompute solar noon precisely
  const solarAtDhuhr = getSolarAtLocalHour(12) // we may iterate a bit
  EoT = solarAtDhuhr.EoT
  delta = solarAtDhuhr.delta
  solarNoon = 12 + timezone - lng/15 - EoT / 60
  // iterate to refine solarNoon
  for (let i=0;i<2;i++){
    const solar = getSolarAtLocalHour(solarNoon)
    EoT = solar.EoT
    solarNoon = 12 + timezone - lng/15 - EoT/60
  }
  const dhuhrLocal = solarNoon

  // Asr (after noon) uses special altitude
  // Use current delta (but iterate inside solvePrayer)
  const asrAltitude = asrAltitudeDeg(lat, delta, asrShadow)
  const asrLocal = solvePrayer(asrAltitude, false)

  // Maghrib (sunset)
  const maghribLocal = solvePrayer(-0.833, false)

  // Isha
  let ishaLocal: number
  if (method === CalcMethod.UmmAlQura && ishaAngle <= -90) {
    // UmmAlQura uses fixed minutes after Maghrib in some implementations (e.g. 90 minutes). If you want exact, override.
    ishaLocal = maghribLocal + minsToHours(90) // default fallback
  } else {
    ishaLocal = solvePrayer(ishaAngle, false)
  }

  // build result
  const resultMins = {
    fajr: hoursToMins(fajrLocal),
    sunrise: hoursToMins(sunriseLocal),
    dhuhr: hoursToMins(dhuhrLocal),
    asr: hoursToMins(asrLocal),
    maghrib: hoursToMins(maghribLocal),
    isha: hoursToMins(ishaLocal),
  }

  const result: PrayerTimes = {
    fajr: formatHM(fajrLocal),
    sunrise: formatHM(sunriseLocal),
    dhuhr: formatHM(dhuhrLocal),
    asr: formatHM(asrLocal),
    maghrib: formatHM(maghribLocal),
    isha: formatHM(ishaLocal),
    _mins: resultMins,
  }

  return result
}
