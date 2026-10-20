import { useParams } from "react-router";
import { PlaceholderPage } from "./placeholder";

export function ProposalPage() {
  const { id } = useParams();
  return <PlaceholderPage titleKey="page.proposal.title" detail={id} />;
}
