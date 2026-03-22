interface Props {
  orgName: string;
}

const SessionManagementHeader = ({ orgName }: Props) => {
  return (
    <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10 mb-6">
      <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">
        Session Management
      </h1>
      {orgName && (
        <p className="text-white/50 text-sm mt-1">
          {orgName}
        </p>
      )}
      <p className="text-white/60 text-sm mt-1">
        Create and monitor attendance sessions with live QR codes
      </p>
    </div>
  );
};

export default SessionManagementHeader;
