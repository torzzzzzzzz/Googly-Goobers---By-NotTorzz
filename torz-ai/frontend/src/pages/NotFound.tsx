import { Link } from "react-router-dom";
import { Button, EmptyState } from "../components/ui";
import { LogoMark } from "../components/layout/Logo";

export default function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center">
      <EmptyState icon={<LogoMark className="size-8" />} title="Page not found" description="That page doesn't exist in TORZ AI." action={<Link to="/"><Button variant="primary">Back to dashboard</Button></Link>} />
    </div>
  );
}
