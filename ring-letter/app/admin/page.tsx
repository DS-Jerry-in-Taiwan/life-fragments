import AdminDashboard from "../../components/admin/AdminDashboard";

// Cloudflare Access protects /admin* and /api/admin*. Reaching this page by a
// full navigation is what triggers the Access sign-in; fetch() to the API
// alone can't, because Access answers it with a cross-origin redirect.
export default function AdminPage() {
  return <AdminDashboard />;
}
