import DashboardLayout from "../../Components/DashBoard/DashboardLayout";
import UsageBanner from "../../Components/DashBoard/UsageBanner";
import WelcomeHeader from "../../Components/DashBoard/WelcomeHeader";
import StatCard from "../../Components/DashBoard/StatCard";
import UploadCard from "../../Components/DashBoard/UploadCard";
import ActiveJobsCard from "../../Components/DashBoard/ActiveJobCard";
import RecentDatasetsTable from "../../Components/DashBoard/RecentDatasetTable";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <UsageBanner />
        <WelcomeHeader name="Marcus" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Total Analysis" value="1,284" extra="+12%" />
          <StatCard title="Available Quota" value="42" suffix="/ 500" />
          <StatCard title="Recent Exports" value="18" extra="Last 7d" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
          <div className="space-y-6">
            <UploadCard />
            <ActiveJobsCard />
          </div>

          <RecentDatasetsTable />
        </div>
      </div>
    </DashboardLayout>
  );
}