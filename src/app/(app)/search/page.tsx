import type { Metadata } from "next";
import { SearchView } from "@/features/search/search-view";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return <SearchView />;
}
