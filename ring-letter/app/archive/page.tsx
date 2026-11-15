import type { Metadata } from "next";
import ArchiveReader from "../../components/archive/ArchiveReader";

export const metadata: Metadata = { title: "公開信箱" };

export default function ArchivePage() {
  return <ArchiveReader />;
}
