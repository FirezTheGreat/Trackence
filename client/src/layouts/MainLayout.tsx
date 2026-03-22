import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';

const MainLayout = () => {
    return (
        <div className="relative min-h-screen w-full flex flex-col">
            <div className="absolute inset-0 w-full h-full animated-ocean-background overflow-hidden pointer-events-none" style={{ zIndex: -1 }}>
                <div className="absolute top-[-20%] left-[-10%] w-125 h-125 rounded-full bg-black/25 blur-[100px]" />
                <div className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 w-125 h-125 rounded-full bg-black/25 blur-[100px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-125 h-125 rounded-full bg-black/30 blur-[100px]" />
            </div>

            <Navbar />
            <main className="pt-24 grow">
                <Outlet />
            </main>
        </div >
    );
}

export default MainLayout;