import { useParams } from "react-router";
import { PlaceholderPage } from "./placeholder";

export function EditorPage() {
  const { id } = useParams();
  return <PlaceholderPage titleKey="page.editor.title" detail={id} />;
}
