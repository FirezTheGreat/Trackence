import { Button } from "../../components/ui";

interface SessionHistoryFiltersProps {
  sessionSearch: string;
  setSessionSearch: (value: string) => void;
  setCurrentPage: (page: number) => void;
  sessionFilter: "all" | "active";
  setSessionFilter: (filter: "all" | "active") => void;
}

export default function SessionHistoryFilters({
  sessionSearch,
  setSessionSearch,
  setCurrentPage,
  sessionFilter,
  setSessionFilter,
}: SessionHistoryFiltersProps) {
  return (
    <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 max-w-sm">
        <input
          type="text"
          value={sessionSearch}
          onChange={(event) => {
            setSessionSearch(event.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search by session ID"
          className="w-full px-4 py-2 rounded-lg bg-white/10 text-white placeholder:text-white/40 border border-white/10 focus:outline-none focus:border-accent"
        />
      </div>
      <div className="flex gap-2">
        {(["all", "active"] as const).map((filter) => (
          <Button
            key={filter}
            onClick={() => {
              setSessionFilter(filter);
              setCurrentPage(1);
            }}
            size="sm"
            variant={sessionFilter === filter ? "primary" : "secondary"}
            className="cursor-pointer"
          >
            {filter === "all" ? "All Sessions" : "Active Only"}
          </Button>
        ))}
      </div>
    </div>
  );
}
