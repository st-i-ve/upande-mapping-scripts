import { AppHeader } from "@/components/console/AppHeader";
import { Sidebar } from "@/components/console/Sidebar";
import { MapCanvas } from "@/components/map/MapCanvas";

/**
 * Field Console shell (M2): header + control sidebar + live Leaflet map.
 * Panels are demo content for now; real data wiring lands in later milestones.
 */
export default function Home() {
  return (
    <>
      <AppHeader status="idle" statusText="ready" />
      <main className="app-main">
        <Sidebar />
        <div className="relative flex-1">
          <MapCanvas />
        </div>
      </main>
    </>
  );
}
