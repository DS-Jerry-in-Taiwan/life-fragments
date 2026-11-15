import type { Metadata } from "next";
import MyStories from "../../components/mine/MyStories";

export const metadata: Metadata = { title: "我的片段" };

// Client-only data (by cookie): never server-rendered, so nothing personal is cached.
export default function MinePage() {
  return <MyStories />;
}
