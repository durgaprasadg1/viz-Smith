import Sidebar from "@/app/Components/User/Sidebar";

export default function UserLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#0B1020] text-white flex">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
