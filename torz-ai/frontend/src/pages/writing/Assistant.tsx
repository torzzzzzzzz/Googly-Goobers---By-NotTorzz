import { useToolVisit } from "../../lib/hooks";
import { WritingWorkspace } from "../../components/tool/WritingWorkspace";

export default function Assistant() {
  useToolVisit("assistant");
  return <WritingWorkspace />;
}
