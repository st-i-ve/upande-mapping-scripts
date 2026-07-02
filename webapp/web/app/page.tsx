import { AppHeader } from "@/components/layout/AppHeader";
import {
  Button,
  Checkbox,
  ListRow,
  SectionCard,
  Slider,
  Toggle,
} from "@/components/ui";
import styles from "./page.module.css";

/**
 * M1 shell: header + sidebar panel + map slot. The panel here demonstrates
 * the reusable primitives; real panels replace this content in later
 * milestones, and the map slot is filled by MapCanvas in M2.
 */
export default function Home() {
  return (
    <>
      <AppHeader status="idle" statusText="ready" />
      <main className="app-main">
        <aside className={styles.panel}>
          <SectionCard title="Reference points" index="1">
            <Toggle label="Show on map" defaultChecked />
            <Slider label="Opacity" valueLabel="60%" min={0} max={100} defaultValue={60} />
            <ul className={styles.list}>
              <ListRow actions={<><a href="#">zoom</a><a href="#">delete</a></>}>
                <strong>A</strong> 0.068612, 35.748031
              </ListRow>
              <ListRow actions={<><a href="#">zoom</a><a href="#">delete</a></>}>
                <strong>Kapkolia-Greenhouse-18-NorthWest-survey-marker-2024</strong>{" "}
                0.070145, 35.751902
              </ListRow>
            </ul>
          </SectionCard>

          <SectionCard title="Saved shapes" index="2">
            <div className={styles.row}>
              <Checkbox label="Select all" />
              <Button variant="danger" disabled>Delete selected</Button>
            </div>
            <ul className={styles.list}>
              <ListRow actions={<><a href="#">hide</a><a href="#">use</a><a href="#">delete</a></>}>
                <Checkbox /> ● <strong>Block A outline</strong>
              </ListRow>
            </ul>
            <Button variant="primary">Save current shape</Button>
          </SectionCard>
        </aside>

        <div className={styles.mapSlot} aria-label="Map (mounted in M2)">
          <span className={styles.mapHint}>Map canvas mounts here (M2)</span>
        </div>
      </main>
    </>
  );
}
