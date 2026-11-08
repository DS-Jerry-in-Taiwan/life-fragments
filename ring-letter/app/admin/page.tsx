import RingLetterApp from '../../components/ring-letter-app';

// Cloudflare Access protects /admin* and /api/admin*. Reaching this page by a
// full navigation is what triggers the Access sign-in; fetch() to the API
// alone can't, because Access answers it with a cross-origin redirect.
export default function AdminPage() {
  return <RingLetterApp initialTab="admin" />;
}
