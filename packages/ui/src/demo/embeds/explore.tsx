import { useLayers, useNotes, useStats } from "@/lib/queries";
import { ExplorePage } from "@/pages/explore";
import { useEmbedReady } from "../embed";

export default function ExploreEmbed() {
  const notes = useNotes();
  const layers = useLayers();
  const stats = useStats();
  useEmbedReady(notes.isSuccess && layers.isSuccess && stats.isSuccess);
  return <ExplorePage allowCreate={false} />;
}
