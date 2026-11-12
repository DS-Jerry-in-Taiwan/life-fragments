import MyStories from "../../components/mine/MyStories";

// Client-only data (by cookie): never server-rendered, so nothing personal is cached.
export default function MinePage() {
  return <MyStories />;
}
