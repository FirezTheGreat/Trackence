interface NotificationHistoryItem {
  notificationId: string;
  eventType: string;
  sessionId?: string | null;
  recipients: string[];
  recipientCount: number;
  subject: string;
  status: "queued" | "processing" | "sent" | "failed" | "dead";
  sentAt?: string | null;
  lastError?: string | null;
  createdAt: string;
}

interface Props {
  loading: boolean;
  items: NotificationHistoryItem[];
  onRefresh: () => void;
  page: number;
  totalPages: number;
  totalItems: number;
  statusFilter: "all" | "queued" | "processing" | "sent" | "failed" | "dead";
  searchFilter: string;
  dateFrom: string;
  dateTo: string;
  onStatusFilterChange: (value: "all" | "queued" | "processing" | "sent" | "failed" | "dead") => void;
  onSearchFilterChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onResetFilters: () => void;
  onPageChange: (page: number) => void;
}

const statusClass = (status: NotificationHistoryItem["status"]) => {
  if (status === "sent") return "border-emerald-400/35 bg-emerald-500/12 text-emerald-300";
  if (status === "processing") return "border-blue-400/35 bg-blue-500/12 text-blue-300";
  if (status === "queued") return "border-amber-400/35 bg-amber-500/12 text-amber-300";
  if (status === "failed") return "border-orange-400/35 bg-orange-500/12 text-orange-300";
  return "border-red-400/35 bg-red-500/12 text-red-300";
};

const prettyEvent = (eventType: string) =>
  eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const getPageButtons = (page: number, totalPages: number): Array<number | "..."> => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }

  const buttons: Array<number | "..."> = [1];
  if (page > 3) buttons.push("...");

  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let current = start; current <= end; current += 1) {
    buttons.push(current);
  }

  if (page < totalPages - 2) buttons.push("...");
  buttons.push(totalPages);
  return buttons;
};

const NotificationHistoryPanel = ({
  loading,
  items,
  onRefresh,
  page,
  totalPages,
  totalItems,
  statusFilter,
  searchFilter,
  dateFrom,
  dateTo,
  onStatusFilterChange,
  onSearchFilterChange,
  onDateFromChange,
  onDateToChange,
  onResetFilters,
  onPageChange,
}: Props) => {
  return (
    <section className="backdrop-blur-2xl bg-secondary/45 rounded-2xl border border-white/10 p-5 sm:p-6 shadow-lg shadow-black/10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-white text-lg sm:text-xl font-semibold">Email Delivery History</h3>
          <p className="text-white/55 text-xs sm:text-sm mt-1">Track queued, retried, delivered, and failed notifications.</p>
        </div>
        <button
          onClick={onRefresh}
          className="h-8.5 sm:h-9.5 px-3 sm:px-4 rounded-xl border border-white/20 bg-white/8 text-white/85 hover:bg-white/12 transition text-xs sm:text-sm cursor-pointer touch-manipulation"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <input
          value={searchFilter}
          onChange={(e) => onSearchFilterChange(e.target.value)}
          placeholder="Search subject, recipient, event"
          className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-accent/50"
        />
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as "all" | "queued" | "processing" | "sent" | "failed" | "dead")}
          className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none focus:border-accent/50"
        >
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="processing">Processing</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="dead">Dead</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none focus:border-accent/50"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={onResetFilters}
            className="h-10 px-3 rounded-lg border border-white/20 bg-white/8 text-white/85 hover:bg-white/12 transition text-xs sm:text-sm cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-white/60 text-sm">Loading notification history...</p>
      ) : items.length === 0 ? (
        <p className="text-white/60 text-sm">No notifications yet for this organization.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.notificationId}
              className="rounded-xl border border-white/12 bg-secondary/35 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusClass(item.status)}`}>
                    {item.status}
                  </span>
                  <span className="text-xs text-white/55">{prettyEvent(item.eventType)}</span>
                  {item.sessionId && (
                    <span className="text-[11px] text-accent/85 border border-accent/25 rounded-full px-2 py-0.5">
                      {item.sessionId}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-white/40">{new Date(item.createdAt).toLocaleString()}</span>
              </div>

              <p className="text-sm text-white mt-2 wrap-break-word">{item.subject}</p>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/55">
                <span>Recipients: {item.recipientCount}</span>
                {item.sentAt && <span>Sent: {new Date(item.sentAt).toLocaleString()}</span>}
              </div>

              <div className="mt-2">
                <p className="text-[11px] uppercase tracking-wider text-white/45 mb-1.5">Recipient details</p>
                {item.recipients.length === 0 ? (
                  <p className="text-xs text-white/45">No recipients stored.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {item.recipients.map((recipient) => (
                      <span
                        key={`${item.notificationId}-${recipient}`}
                        className="text-[11px] px-2 py-1 rounded-full border border-white/20 bg-white/5 text-white/75 break-all"
                      >
                        {recipient}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {item.lastError && (
                <p className="mt-2 text-xs text-red-300/90 wrap-break-word">Last error: {item.lastError}</p>
              )}
            </article>
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-xs text-white/50">
            Page {page} of {totalPages} • {totalItems} total notifications
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="h-9 px-3 rounded-lg border border-white/20 bg-white/8 text-white/85 hover:bg-white/12 transition text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            {totalPages > 2 &&
              getPageButtons(page, totalPages).map((btn, idx) =>
                btn === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-white/50 text-sm">
                    ...
                  </span>
                ) : (
                  <button
                    key={`page-${btn}`}
                    onClick={() => onPageChange(btn)}
                    className={`h-9 min-w-9 px-3 rounded-lg border text-sm transition cursor-pointer ${
                      btn === page
                        ? "border-accent/55 bg-accent/20 text-accent"
                        : "border-white/20 bg-white/8 text-white/85 hover:bg-white/12"
                    }`}
                  >
                    {btn}
                  </button>
                )
              )}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-9 px-3 rounded-lg border border-white/20 bg-white/8 text-white/85 hover:bg-white/12 transition text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default NotificationHistoryPanel;
