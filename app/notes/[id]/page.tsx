"use client";

import { useParams } from "next/navigation";
import { NoteWorkspace } from "@/components/NoteWorkspace";

export default function NotePage() {
  const params = useParams<{ id: string }>();
  return <NoteWorkspace id={params.id} />;
}
