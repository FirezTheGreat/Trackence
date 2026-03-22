import { Button } from "../../components/ui";

interface SessionHistoryHeaderProps {
  orgName: string;
  onRefresh: () => void;
}

export default function SessionHistoryHeader({ orgName, onRefresh }: SessionHistoryHeaderProps) {
  return (
    <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-6 shadow-lg shadow-black/10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">Session History</h1>
          {orgName && <p className="text-white/50 text-sm mt-1">{orgName}</p>}
          <p className="text-white/60 text-sm mt-1">View past attendance sessions and records</p>
        </div>
        <Button onClick={onRefresh} size="md" variant="secondary" className="cursor-pointer">
          Refresh
        </Button>
      </div>
    </div>
  );
}
