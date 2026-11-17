import { Link, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/app-layout";
import { AppNav } from "@/components/app-nav";
import { DashboardPage } from "@/pages/dashboard-page";
import { OrdersPage } from "@/pages/orders-page";
import { SalesPage } from "@/pages/sales-page";

function NotFound() {
  return (
    <AppLayout title="Not found" actions={<AppNav />}>
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <Link className="mt-4 inline-block text-sm underline" to="/">
        Back home
      </Link>
    </AppLayout>
  );
}

// Every page needs a Route here. An imported-but-unrouted component is tree-shaken out of the
// bundle with no build error, so the page silently 404s at runtime.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/sales" element={<SalesPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
