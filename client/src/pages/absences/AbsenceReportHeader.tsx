interface Props {
    orgName: string;
}

const AbsenceReportHeader = ({ orgName }: Props) => {
    return (
        <>
            <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-6 shadow-lg shadow-black/10">
                <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">
                    Absence Report
                </h1>
                {orgName && (
                    <p className="text-white/50 text-sm mt-1">
                        {orgName}
                    </p>
                )}
                <p className="text-white/60 text-sm mt-1">
                    Track and review absence requests from members
                </p>
            </div>
        </>
    );
};

export default AbsenceReportHeader;
