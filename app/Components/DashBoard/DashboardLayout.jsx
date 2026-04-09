import Sidebar from "../User/Sidebar";
import TopNavbar from "../Home/Navbar";

export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#070d1f] text-white">
      <div className="flex">
        <Sidebar />

        <div className="flex-1 min-h-screen">
          <TopNavbar />

          <main className="p-6 md:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}