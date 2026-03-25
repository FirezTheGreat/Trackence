import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { shouldEnableIOSPerfMode } from '../utils/device';

const MainLayout = () => {
    const [reduceVisualEffects, setReduceVisualEffects] = useState(false);
    const location = useLocation();

    useEffect(() => {
        setReduceVisualEffects(shouldEnableIOSPerfMode());
    }, []);

    return (
        <div className="relative min-h-screen w-full flex flex-col selection:bg-accent/30 selection:text-white">
            {!reduceVisualEffects && (
                <div
                    className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none transition-colors duration-1000 animated-ocean-background"
                    style={{ zIndex: -1 }}
                >
                    <div className="absolute top-[0%] left-[-15%] w-[60dvw] h-[60dvw] md:w-[40vw] md:h-[40vw] rounded-full bg-accent/10 blur-[120px] mix-blend-screen" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50dvw] h-[50dvw] md:w-[35vw] md:h-[35vw] rounded-full bg-[#38BDF8]/20 blur-[130px] mix-blend-screen" />
                </div>
            )}

            <Navbar />
            <main className="pt-18 sm:pt-24 grow">
                <Outlet key={location.pathname} />
            </main>
        </div >
    );
}

export default MainLayout;
