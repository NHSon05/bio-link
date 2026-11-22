"use client";

import { createContext, useContext } from "react";
import type { Site } from "@bio-link/schema";
import type { TrafficDay } from "./traffic";
import { siteRequest } from "./siteRequest";

export type SiteSummary = {
  slug: string;
  title: string;
  template: string;
  platform: string | null;
  canEdit: boolean;
  publishedSlug: string | null;
};

export type WorkspaceApi = {
  sample: boolean;
  list(signal: AbortSignal): Promise<SiteSummary[]>;
  read(slug: string, published: boolean, signal: AbortSignal): Promise<Site>;
  save(site: Site, publish: boolean): Promise<Site>;
  traffic(slug: string, signal: AbortSignal): Promise<TrafficDay[]>;
};

const liveApi: WorkspaceApi = {
  sample: false,
  list: (signal) => siteRequest("/api/sites", { signal }),
  read: (slug, published, signal) =>
    siteRequest("/api/sites/" + slug + (published ? "?revision=published" : ""), { signal }),
  save: (site, publish) =>
    siteRequest("/api/sites/" + site.slug, {
      method: publish ? "PUT" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(site),
    }),
  traffic: (slug, signal) => siteRequest("/api/sites/" + slug + "/traffic", { signal }),
};

export const WorkspaceApiContext = createContext(liveApi);
export const useWorkspaceApi = () => useContext(WorkspaceApiContext);
