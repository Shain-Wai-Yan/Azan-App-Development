import { calculatePrayerTimes, CalcMethod, CITIES } from "@/lib/solar-calc"
import PrayerTimesClient from "@/components/prayer-times-client"

export default async function LandingPage() {
  // Default to Yangon for pre-rendering
  const defaultCity = CITIES[0]
  const date = new Date()
  const seoTimes = calculatePrayerTimes(
    defaultCity.lat,
    defaultCity.lng,
    defaultCity.timezone,
    date,
    CalcMethod.Karachi,
    2,
    undefined,
    undefined,
    0,
  )

  return (
    <div className="flex flex-col min-h-screen">
      {/* We pass initialTimes as null so the client waits for GPS or selection */}
      <PrayerTimesClient initialTimes={null} initialCity={undefined} />

      <div className="sr-only">
        <h1>Azan Myanmar - Precise Islamic Prayer Times</h1>
        <p>
          Providing accurate Fajr, Dhuhr, Asr, Maghrib, and Isha times across Myanmar using astronomical solar
          calculations. Features include a bilingual interface (Burmese/English), Hijri calendar, and offline
          functionality.
        </p>
      </div>
    </div>
  )
}
