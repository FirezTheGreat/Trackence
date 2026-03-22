import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  duration: number | "";
  refreshInterval: number | "";
  notificationRecipients: string;
  personalSavedRecipients: string[];
  orgSavedRecipients: string[];
  useDefaultRecipients: boolean;
  useOrgDefaultRecipients: boolean;
  includeCreator: boolean;
  sendSessionEndEmail: boolean;
  sendAbsenceEmail: boolean;
  attachReport: boolean;
  saveAsDefaults: boolean;
  saveAsOrgDefaults: boolean;
  createLoading: boolean;
  savingDefaults: boolean;
  error: string | null;
  success: string | null;
  onDurationChange: (value: number | "") => void;
  onRefreshIntervalChange: (value: number | "") => void;
  onNotificationRecipientsChange: (value: string) => void;
  onUseDefaultRecipientsChange: (value: boolean) => void;
  onUseOrgDefaultRecipientsChange: (value: boolean) => void;
  onIncludeCreatorChange: (value: boolean) => void;
  onSendSessionEndEmailChange: (value: boolean) => void;
  onSendAbsenceEmailChange: (value: boolean) => void;
  onAttachReportChange: (value: boolean) => void;
  onSaveAsDefaultsChange: (value: boolean) => void;
  onSaveAsOrgDefaultsChange: (value: boolean) => void;
  onRemovePersonalSavedRecipient: (email: string) => void;
  onRemoveOrgSavedRecipient: (email: string) => void;
  onCreate: () => void;
}

const CreateSessionCard = ({
  duration,
  refreshInterval,
  notificationRecipients,
  personalSavedRecipients,
  orgSavedRecipients,
  useDefaultRecipients,
  useOrgDefaultRecipients,
  includeCreator,
  sendSessionEndEmail,
  sendAbsenceEmail,
  attachReport,
  saveAsDefaults,
  saveAsOrgDefaults,
  createLoading,
  savingDefaults,
  error,
  success,
  onDurationChange,
  onRefreshIntervalChange,
  onNotificationRecipientsChange,
  onUseDefaultRecipientsChange,
  onUseOrgDefaultRecipientsChange,
  onIncludeCreatorChange,
  onSendSessionEndEmailChange,
  onSendAbsenceEmailChange,
  onAttachReportChange,
  onSaveAsDefaultsChange,
  onSaveAsOrgDefaultsChange,
  onRemovePersonalSavedRecipient,
  onRemoveOrgSavedRecipient,
  onCreate,
}: Props) => {
  const checkboxClass =
    "h-4 w-4 rounded border-white/30 bg-secondary/70 text-accent focus:ring-accent/40 focus:ring-2";
  const [recipientDraft, setRecipientDraft] = useState("");

  const parseRecipients = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const manualRecipients = parseRecipients(notificationRecipients);
  const manualRecipientSet = new Set(manualRecipients.map((email) => email.toLowerCase()));

  const updateManualRecipients = (emails: string[]) => {
    const deduped: string[] = [];
    const seen = new Set<string>();

    for (const email of emails) {
      const normalized = email.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(normalized);
    }

    onNotificationRecipientsChange(deduped.join(", "));
  };

  const addDraftRecipients = () => {
    const candidates = recipientDraft
      .split(/[;,\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (candidates.length === 0) return;

    updateManualRecipients([...manualRecipients, ...candidates]);
    setRecipientDraft("");
  };

  const toggleManualRecipient = (email: string) => {
    const normalized = email.trim();
    if (!normalized) return;

    const lower = normalized.toLowerCase();
    const next = manualRecipients.filter((item) => item.toLowerCase() !== lower);

    if (!manualRecipientSet.has(lower)) {
      next.push(normalized);
    }

    updateManualRecipients(next);
  };

  const removeManualRecipient = (email: string) => {
    const lower = email.toLowerCase();
    updateManualRecipients(manualRecipients.filter((item) => item.toLowerCase() !== lower));
  };

  return (
    <section className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 p-5 sm:p-6 lg:p-8 mb-8 shadow-lg shadow-black/10">
      <div className="flex items-start justify-between gap-3 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white">Create New Session</h2>
        <span className="text-[10px] sm:text-xs uppercase tracking-widest text-white/45 border border-white/15 rounded-full px-2.5 py-1">
          Notifications Ready
        </span>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-white/80 mb-2 text-sm font-medium uppercase tracking-wider">Duration (minutes)</label>
            <input
              type="number"
              min="1"
              value={duration}
              onChange={(e) => {
                const val = e.target.value === "" ? "" : parseInt(e.target.value);
                if (val === "" || !isNaN(val)) onDurationChange(val === "" ? "" : val);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full h-10.5 px-4 rounded-xl bg-secondary/65 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-accent/55 transition"
            />
          </div>

          <div>
            <label className="block text-white/80 mb-2 text-sm font-medium uppercase tracking-wider">QR Refresh (seconds)</label>
            <input
              type="number"
              min="5"
              max="60"
              value={refreshInterval}
              onChange={(e) => {
                const val = e.target.value === "" ? "" : parseInt(e.target.value);
                if (val === "" || !isNaN(val)) onRefreshIntervalChange(val === "" ? "" : val);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full h-10.5 px-4 rounded-xl bg-secondary/65 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-accent/55 transition"
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/12 bg-secondary/35 p-4 sm:p-5 space-y-4">
          <div>
            <p className="text-white text-sm font-semibold uppercase tracking-wider">Email Notifications</p>
            <p className="text-white/55 text-xs mt-1">
              Industry default flow: use saved personal and organization recipient lists, and only add extra emails when needed.
            </p>
            <p className="text-white/45 text-[11px] mt-1">Click a saved recipient chip to add or remove it from Additional recipients.</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/50 mb-2">My saved recipients ({personalSavedRecipients.length})</p>
              {personalSavedRecipients.length === 0 ? (
                <p className="text-xs text-white/45">No personal recipients saved yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {personalSavedRecipients.map((email) => (
                    <button
                      key={email}
                      type="button"
                      onClick={() => toggleManualRecipient(email)}
                      className={`text-[11px] px-2 py-1 rounded-full border break-all cursor-pointer transition ${
                        manualRecipientSet.has(email.toLowerCase())
                          ? "border-accent/45 bg-accent/20 text-accent"
                          : "border-accent/25 bg-accent/10 text-accent"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span>{email}</span>
                        <span
                          role="button"
                          aria-label={`Remove ${email} from personal saved recipients`}
                          title="Remove from saved recipients"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemovePersonalSavedRecipient(email);
                          }}
                          className={`flex items-center justify-center p-0.5 rounded-full border border-red-400/45 bg-red-500/20 text-red-200 ${savingDefaults ? "opacity-50 cursor-not-allowed" : "hover:bg-red-500/40"}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/50 mb-2">Organization saved recipients ({orgSavedRecipients.length})</p>
              {orgSavedRecipients.length === 0 ? (
                <p className="text-xs text-white/45">No organization recipients saved yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {orgSavedRecipients.map((email) => (
                    <button
                      key={email}
                      type="button"
                      onClick={() => toggleManualRecipient(email)}
                      className={`text-[11px] px-2 py-1 rounded-full border break-all cursor-pointer transition ${
                        manualRecipientSet.has(email.toLowerCase())
                          ? "border-blue-300/45 bg-blue-500/20 text-blue-200"
                          : "border-blue-300/25 bg-blue-500/10 text-blue-300"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span>{email}</span>
                        <span
                          role="button"
                          aria-label={`Remove ${email} from organization saved recipients`}
                          title="Remove from organization saved recipients"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveOrgSavedRecipient(email);
                          }}
                          className={`flex items-center justify-center p-0.5 rounded-full border border-red-400/45 bg-red-500/20 text-red-200 ${savingDefaults ? "opacity-50 cursor-not-allowed" : "hover:bg-red-500/40"}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-white/70 mb-2 text-xs uppercase tracking-wider">Additional recipients</label>
            <div className="w-full px-3 py-2 rounded-xl bg-secondary/65 border border-white/20 focus-within:border-accent/55 transition min-h-21">
              <div className="flex flex-wrap items-center gap-2">
                {manualRecipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-accent/30 bg-accent/12 text-accent max-w-full"
                  >
                    <span className="break-all">{email}</span>
                    <button
                      type="button"
                      onClick={() => removeManualRecipient(email)}
                      className="flex items-center justify-center p-0.5 text-red-300 hover:text-red-100 transition cursor-pointer rounded-full border border-red-400/40 bg-red-500/20 hover:bg-red-500/40"
                      aria-label={`Remove ${email}`}
                      title="Remove recipient"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}

                <input
                  type="text"
                  value={recipientDraft}
                  onChange={(e) => setRecipientDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                      e.preventDefault();
                      addDraftRecipients();
                    }
                  }}
                  onBlur={addDraftRecipients}
                  placeholder={manualRecipients.length === 0 ? "Type email and press Enter, comma, or Tab" : "Add more"}
                  className="flex-1 min-w-38 bg-transparent border-0 outline-none text-white placeholder-white/35 text-sm py-1"
                />
              </div>
            </div>
            <p className="text-[11px] text-white/45 mt-2">Tip: paste multiple emails separated by commas or semicolons.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-white/85">
              <input type="checkbox" checked={useDefaultRecipients} onChange={(e) => onUseDefaultRecipientsChange(e.target.checked)} className={checkboxClass} />
              Use my saved recipients
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-white/85">
              <input type="checkbox" checked={useOrgDefaultRecipients} onChange={(e) => onUseOrgDefaultRecipientsChange(e.target.checked)} className={checkboxClass} />
              Use organization default recipients
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-white/85">
              <input type="checkbox" checked={includeCreator} onChange={(e) => onIncludeCreatorChange(e.target.checked)} className={checkboxClass} />
              Include me automatically
            </label>
          </div>

          <details className="border-t border-white/10 pt-3">
            <summary className="text-sm text-white/75 cursor-pointer select-none">Advanced delivery settings</summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="inline-flex items-center gap-2 text-sm text-white/85">
                <input type="checkbox" checked={sendSessionEndEmail} onChange={(e) => onSendSessionEndEmailChange(e.target.checked)} className={checkboxClass} />
                Send session-end summary
              </label>
              <label className={`inline-flex items-center gap-2 text-sm ${sendSessionEndEmail ? "text-white/85" : "text-white/45"}`}>
                <input
                  type="checkbox"
                  checked={sendAbsenceEmail}
                  onChange={(e) => onSendAbsenceEmailChange(e.target.checked)}
                  className={checkboxClass}
                  disabled={!sendSessionEndEmail}
                />
                Send absence detection report
              </label>
              <label className={`inline-flex items-center gap-2 text-sm sm:col-span-2 ${sendSessionEndEmail ? "text-white/85" : "text-white/45"}`}>
                <input
                  type="checkbox"
                  checked={attachReport}
                  onChange={(e) => onAttachReportChange(e.target.checked)}
                  className={checkboxClass}
                  disabled={!sendSessionEndEmail}
                />
                Attach report file to notification emails
              </label>
            </div>
            {!sendSessionEndEmail && (
              <p className="text-[11px] text-white/45 mt-2">
                Other delivery options are disabled because session-end summary emails are turned off.
              </p>
            )}
          </details>

          <div className="border-t border-white/10 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-accent/95">
              <input type="checkbox" checked={saveAsDefaults} onChange={(e) => onSaveAsDefaultsChange(e.target.checked)} className={checkboxClass} />
              Save as my personal defaults
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-accent/95">
              <input type="checkbox" checked={saveAsOrgDefaults} onChange={(e) => onSaveAsOrgDefaultsChange(e.target.checked)} className={checkboxClass} />
              Save as organization defaults
            </label>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300">{error}</div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-green-500/20 border border-green-500/50 text-green-300">{success}</div>
        )}

        <button
          onClick={onCreate}
          disabled={createLoading}
          className="w-full h-11 bg-linear-to-r from-accent to-accent/80 hover:from-accent/90 hover:to-accent/70 text-white font-semibold rounded-xl transition disabled:opacity-50 cursor-pointer"
        >
          {createLoading ? "Creating..." : "Create Session"}
        </button>
      </div>
    </section>
  );
};

export default CreateSessionCard;
