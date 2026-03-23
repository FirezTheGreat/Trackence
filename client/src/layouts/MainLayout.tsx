import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';

const MainLayout = () => {
    const { pathname } = useLocation();
    const isAuthSurface = pathname.startsWith('/auth/') || pathname.startsWith('/invite/');

    return (
        <div className="relative min-h-screen w-full flex flex-col">
            <div
                className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none ${
                    isAuthSurface
                        ? 'bg-linear-to-br from-[#0f2027] via-[#203a43] to-[#2c5364]'
                        : 'animated-ocean-background'
                }`}
                style={{ zIndex: -1 }}
            >
                {!isAuthSurface && (
                    <>
                        <div className="absolute top-[-20%] left-[-10%] w-125 h-125 rounded-full bg-black/25 blur-[100px]" />
                        <div className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 w-125 h-125 rounded-full bg-black/25 blur-[100px]" />
                        <div className="absolute bottom-[-20%] right-[-10%] w-125 h-125 rounded-full bg-black/30 blur-[100px]" />
                    </>
                )}
            </div>

            <Navbar />
            <main className="pt-24 grow">
                <Outlet />
            </main>
        </div >
    );
}

export default MainLayout;