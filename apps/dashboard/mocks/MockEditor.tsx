"use client";

import { useMemo } from "react";
import Editor from "@/components/Editor";
import { WorkspaceApiContext } from "@/lib/workspace-api";
import { mockWorkspaceApi } from "./workspace";

export default function MockEditor({
  userId,
  email,
  landingUrl,
}: {
  userId: string;
  email: string;
  landingUrl: string;
}) {
  const api = useMemo(() => mockWorkspaceApi(userId), [userId]);
  return (
    <WorkspaceApiContext.Provider value={api}>
      <Editor email={email} landingUrl={landingUrl} />
    </WorkspaceApiContext.Provider>
  );
}
