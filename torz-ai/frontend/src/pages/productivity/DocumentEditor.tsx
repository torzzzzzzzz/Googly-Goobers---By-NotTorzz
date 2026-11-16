import { useParams } from "react-router-dom";
import { useToolVisit } from "../../lib/hooks";
import { WritingWorkspace } from "../../components/tool/WritingWorkspace";

export default function DocumentEditor() {
  useToolVisit("documents");
  const { id } = useParams();
  return <WritingWorkspace key={id} docId={Number(id)} />;
}
