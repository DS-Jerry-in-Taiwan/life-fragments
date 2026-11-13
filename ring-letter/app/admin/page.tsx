import { Suspense } from "react";
import AdminDashboard from "../../components/admin/AdminDashboard";

// Cloudflare Access protects /admin* and /api/admin*. Reaching this page by a
// full navigation is what triggers the Access sign-in; fetch() to the API
// alone can't, because Access answers it with a cross-origin redirect.
// The story filters are in the query string (/admin?status=approved&q=…).
export default function AdminPage() {
  return (
    <Suspense>
      <AdminDashboard />
    </Suspense>
  );
}
