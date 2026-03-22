import { Button } from "../../components/ui";

interface SessionsPaginationProps {
  totalPages: number;
  totalSessions: number;
  currentPage: number;
  sessionsPerPage: number;
  getPaginationButtons: () => (number | string)[];
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

export default function SessionsPagination({
  totalPages,
  totalSessions,
  currentPage,
  sessionsPerPage,
  getPaginationButtons,
  setCurrentPage,
}: SessionsPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/20">
      <p className="text-sm text-white/60">
        Showing {totalSessions === 0 ? 0 : (currentPage - 1) * sessionsPerPage + 1} - {Math.min(currentPage * sessionsPerPage, totalSessions)} of {totalSessions} sessions
      </p>
      <div className="flex gap-2">
        <Button
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          size="sm"
          variant="secondary"
          disabled={currentPage === 1}
          className="cursor-pointer"
        >
          ← Previous
        </Button>
        <div className="flex gap-1 flex-wrap">
          {getPaginationButtons().map((button, index) => {
            if (button === "...") {
              return (
                <div key={`dots-${index}`} className="w-9 h-9 flex items-center justify-center text-white/40 font-semibold">
                  •••
                </div>
              );
            }
            return (
              <button
                key={button}
                onClick={() => setCurrentPage(button as number)}
                className={`w-9 h-9 rounded-lg text-sm transition cursor-pointer font-medium ${
                  currentPage === button
                    ? "bg-accent text-white shadow-lg shadow-accent/50"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {button}
              </button>
            );
          })}
        </div>
        <Button
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          size="sm"
          variant="secondary"
          disabled={currentPage === totalPages}
          className="cursor-pointer"
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
