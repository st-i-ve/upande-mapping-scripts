import { AppShell } from "@/components/console/AppShell";

/**
 * Unified console: left tool rail + center map/3D + right control sidebar.
 * 2D and 3D are switchable views sharing the same chrome.
 */
export default function Home() {
  return <AppShell />;
}
